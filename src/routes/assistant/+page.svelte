<script>
	import { supabase } from '$lib/supabase';
	import { onMount } from 'svelte';

	// --- State Variables ---
	let currentView = 'list';
	let listFilter = 'all';
	let appointments = [];
	let schedules = [];
	let reportingTimings = [];
	let isManualEditing = false;

	let selectedApptId = null;

	let slots = { new_patient: '', old_patient: '', report: '' };
	let viewDate = new Date().toLocaleDateString('en-CA');
	const todayStr = new Date().toLocaleDateString('en-CA');
	const dayNames = ['রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার'];

	// Timing Editor State
	let editingId = null;
	let tempRow = { serial_range: '', hour: '06', minute: '30', period: 'AM', patient_type: 'new' };

	// Schedule Form State
	const initialForm = {
		day_of_week: 1,
		visitation_start: '17:00',
		visitation_end: '20:00',
		max_patients: 30,
		booking_window_type: 'specific_day',
		booking_day_offset: 1,
		booking_start_time: '07:00',
		is_active: true
	};
	let form = { ...initialForm };

	// Manual Booking State
	let manualEntry = {
		name: '',
		phone: '',
		age: '',
		serial: null,
		patient_type: 'new',
		date: new Date().toLocaleDateString('en-CA')
	};

	function getPrefix(type) {
		const t = (type || 'new').toLowerCase();
		if (t === 'new') return 'N-';
		if (t === 'old') return 'O-';
		if (t === 'report') return 'R-';
		return '#';
	}

	onMount(() => {
		fetchAllData();
		setupRealtime();
	});
	function setupRealtime() {
		supabase
			.channel('assistant-view')
			.on('postgres_changes', { event: '*', table: 'appointments' }, () => fetchAppointments())
			.subscribe();
	}
	async function fetchAllData() {
		await fetchSchedules();
		await fetchGlobalSettings();
		await fetchReportingTimings();
		await fetchAppointments();
	}
	async function fetchAppointments() {
		const targetDate = currentView === 'book' ? manualEntry.date : viewDate;
		const { data } = await supabase
			.from('appointments')
			.select('*')
			.eq('appointment_date', targetDate)
			.order('serial_no', { ascending: true });
		appointments = data || [];
	}
	async function fetchSchedules() {
		const { data } = await supabase.from('doctor_schedules').select('*').order('day_of_week');
		schedules = data || [];
	}
	async function fetchReportingTimings() {
		const { data } = await supabase
			.from('reporting_timings')
			.select('*')
			.order('sort_order', { ascending: true });
		reportingTimings = data || [];
	}
	async function fetchGlobalSettings() {
		const { data } = await supabase.from('global_settings').select('*').single();
		if (data) {
			slots.new_patient = data.new_slots_csv || '';
			slots.old_patient = data.old_slots_csv || '';
			slots.report = data.report_slots_csv || '';
		}
	}

	async function suggestNextSerial() {
		const bookedSerialsForType = appointments
			.filter(
				(a) => (a.patient_type || '').toLowerCase() === manualEntry.patient_type.toLowerCase()
			)
			.map((a) => a.serial_no);
		let suggestion = 1;
		while (bookedSerialsForType.includes(suggestion)) {
			suggestion++;
		}
		manualEntry.serial = suggestion;
		isManualEditing = false;
	}

	function handleParamChange() {
		isManualEditing = false;
		fetchAppointments().then(() => suggestNextSerial());
	}

	function toggleRow(id) {
		selectedApptId = selectedApptId === id ? null : id;
	}

	async function handleManualBook() {
		if (!manualEntry.serial) return alert('সিরিয়াল নম্বর দিন');
		const isAlreadyBooked = appointments.some(
			(a) =>
				a.serial_no === parseInt(manualEntry.serial) &&
				(a.patient_type || '').toLowerCase() === manualEntry.patient_type.toLowerCase()
		);
		if (isAlreadyBooked) return alert(`ইতিমধ্যে বুক করা!`);
		try {
			const { error } = await supabase.rpc('assistant_book_appointment', {
				appointment_date: manualEntry.date,
				patient_name: manualEntry.name,
				contact_number: manualEntry.phone,
				age: parseInt(manualEntry.age) || 0,
				serial_no: parseInt(manualEntry.serial),
				patient_type: manualEntry.patient_type
			});
			if (error) throw error;
			alert(`বুকিং সম্পন্ন: ${getPrefix(manualEntry.patient_type)}${manualEntry.serial}`);
			manualEntry.name = '';
			manualEntry.phone = '';
			manualEntry.age = '';
			await fetchAppointments();
			suggestNextSerial();
		} catch (err) {
			alert('ভুল হয়েছে: ' + err.message);
		}
	}

	async function toggleStatus(id, field, value) {
		await supabase
			.from('appointments')
			.update({ [field]: value })
			.eq('id', id);
		fetchAppointments();
	}

	async function announcePatient(appt) {
		// এখানে আমরা অডিও অ্যানাউন্সমেন্ট লজিক পরে যোগ করব
		console.log(`Announcing: ${appt.patient_name}`);
		alert(`${getPrefix(appt.patient_type)}${appt.serial_no} নম্বর রোগীকে ডাকা হচ্ছে...`);
	}
	async function saveSchedule() {
		const { id, ...payload } = form;
		await supabase.from('doctor_schedules').upsert([payload]);
		fetchSchedules();
		resetForm();
		alert('সংরক্ষণ করা হয়েছে!');
	}
	function editSchedule(s) {
		form = { ...s };
		window.scrollTo({ top: 0, behavior: 'smooth' });
	}
	function resetForm() {
		form = { ...initialForm };
	}
	async function deleteSchedule(id) {
		if (confirm('ডিলিট করতে চান?')) {
			await supabase.from('doctor_schedules').delete().eq('id', id);
			fetchSchedules();
		}
	}
	async function toggleScheduleActive(id, currentStatus) {
		await supabase.from('doctor_schedules').update({ is_active: !currentStatus }).eq('id', id);
		fetchSchedules();
	}
	function initiateAdd() {
		editingId = 'new';
		tempRow = { serial_range: '', hour: '06', minute: '30', period: 'AM', patient_type: 'new' };
	}
	function initiateEdit(row) {
		editingId = row.id;
		const [time, period] = row.reporting_time.split(' ');
		const [h, m] = time.split(':');
		tempRow = {
			serial_range: row.serial_range,
			hour: h,
			minute: m,
			period: period,
			patient_type: row.patient_type || 'new'
		};
	}
	async function saveTiming(id) {
		const finalTime = `${tempRow.hour}:${tempRow.minute} ${tempRow.period}`;
		const payload = {
			serial_range: tempRow.serial_range,
			reporting_time: finalTime,
			patient_type: tempRow.patient_type
		};
		if (id === 'new')
			await supabase
				.from('reporting_timings')
				.insert([{ ...payload, sort_order: reportingTimings.length }]);
		else await supabase.from('reporting_timings').update(payload).eq('id', id);
		editingId = null;
		fetchReportingTimings();
	}
	async function deleteTiming(id) {
		if (confirm('মুছে ফেলতে চান?')) {
			await supabase.from('reporting_timings').delete().eq('id', id);
			fetchReportingTimings();
		}
	}
	async function saveUniversalSlots() {
		await supabase.from('global_settings').upsert({
			id: 1,
			new_slots_csv: slots.new_patient,
			old_slots_csv: slots.old_patient,
			report_slots_csv: slots.report
		});
		alert('আপডেট হয়েছে!');
	}
	function getWeekdayBangla(dateStr) {
		return dateStr ? dayNames[new Date(dateStr).getDay()] : '';
	}
	function format12hBangla(timeStr) {
		if (!timeStr) return 'সেট করা নেই';
		const [hh, mm] = timeStr.split(':');
		let hour = parseInt(hh);
		const ampm = hour >= 12 ? 'PM' : 'AM';
		hour = hour % 12 || 12;
		return `${hour}:${mm} ${ampm}`;
	}

	$: filteredAppointments = appointments.filter((a) => {
		if (listFilter === 'all') return true;
		return (a.patient_type || '').toLowerCase() === listFilter;
	});
	$: if (viewDate && currentView === 'list') fetchAppointments();
</script>

<div class="max-w-6xl mx-auto p-3 md:p-6 mb-12">
	<div
		class="flex overflow-x-auto no-scrollbar md:flex-wrap gap-2 mb-6 bg-slate-200 p-1.5 rounded-2xl w-full md:w-fit shadow-inner"
	>
		{#each ['list', 'book', 'timing', 'maker', 'slots'] as view}
			<button
				on:click={() => (currentView = view)}
				class="whitespace-nowrap flex-1 md:flex-none px-5 md:px-8 py-3 md:py-2.5 rounded-xl font-black transition text-xs md:text-base {currentView ===
				view
					? 'bg-white shadow text-blue-700'
					: 'text-slate-500'}"
			>
				{#if view === 'list'}সিরিয়াল তালিকা
				{:else if view === 'book'}বুকিং
				{:else if view === 'timing'}টাইমিং
				{:else if view === 'maker'}শিডিউল
				{:else}স্লট{/if}
			</button>
		{/each}
	</div>

	{#if currentView === 'list'}
		<div
			class="bg-white p-4 md:p-6 rounded-3xl shadow-sm border mb-6 flex flex-col md:flex-row justify-between items-center gap-4"
		>
			<div class="flex flex-col gap-3 w-full md:w-auto">
				<h2 class="text-xl font-bold text-slate-800 tracking-tight">সিরিয়াল তালিকা</h2>
				<div class="grid grid-cols-4 md:flex bg-slate-100 p-1 rounded-xl gap-1">
					{#each [['all', 'সব'], ['new', 'New'], ['old', 'Old'], ['report', 'Rep']] as [val, label]}
						<button
							on:click={() => (listFilter = val)}
							class="py-2.5 md:px-4 md:py-1 text-[11px] md:text-[10px] font-black rounded-lg transition {listFilter ===
							val
								? 'bg-white shadow text-blue-600'
								: 'text-slate-500'}">{label}</button
						>
					{/each}
				</div>
			</div>
			<div class="flex items-center justify-between w-full md:w-auto gap-4">
				<div class="md:text-right">
					<input
						type="date"
						bind:value={viewDate}
						class="border-2 border-slate-100 p-2 rounded-xl font-bold text-blue-700 outline-none"
					/>
					<p class="text-[10px] font-black text-blue-400 uppercase mt-1">
						{getWeekdayBangla(viewDate)}
					</p>
				</div>
			</div>
		</div>

		<div class="bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-100">
			<table class="w-full text-left">
				<thead
					class="bg-slate-50 border-b text-slate-400 uppercase text-[10px] font-black tracking-widest"
				>
					<tr>
						<th class="px-5 md:px-8 py-4">সিরিয়াল</th>
						<th class="px-5 md:px-8 py-4">রোগীর বিবরণ</th>
						<th class="hidden md:table-cell px-8 py-4 text-center">অবস্থা ও অ্যাকশন</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-slate-100">
					{#each filteredAppointments as appt}
						<tr
							on:click={() => toggleRow(appt.id)}
							class="cursor-pointer transition-all duration-200
            {appt.is_visited
								? 'bg-slate-50 opacity-60'
								: appt.is_present
									? 'bg-green-50 border-l-4 border-l-green-500'
									: 'hover:bg-blue-50/30'}"
						>
							<td class="px-5 md:px-8 py-4">
								<div
									class="font-black text-2xl md:text-4xl
                    {appt.is_visited
										? 'text-slate-300'
										: appt.is_present
											? 'text-green-700'
											: 'text-blue-600'}"
								>
									{getPrefix(appt.patient_type)}{appt.serial_no}
								</div>
							</td>
							<td class="px-5 md:px-8 py-4">
								<div class="font-bold text-slate-800 text-base md:text-xl">{appt.patient_name}</div>
								<div
									class="text-[11px] font-bold {appt.is_present
										? 'text-green-600'
										: 'text-blue-500'} mb-1"
								>
									{appt.contact_number || 'No Number'}
								</div>
								<div class="flex flex-wrap gap-2 items-center mt-1">
									<span class="text-[10px] font-black text-slate-400 uppercase">{appt.age} বছর</span
									>
									<span
										class="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded text-[8px] font-black uppercase"
									>
										{appt.patient_type || 'NEW'}
									</span>

									{#if appt.is_present && !appt.is_visited}
										<span
											class="text-[11px] font-black text-white bg-green-500 px-3 py-1 rounded-full flex items-center gap-1 shadow-sm"
										>
											● চেম্বারে আছে
										</span>
									{:else if appt.is_visited}
										<span
											class="text-[10px] font-black text-slate-500 bg-slate-200 px-2 py-0.5 rounded-lg"
										>
											✓ দেখা শেষ
										</span>
									{/if}
								</div>
							</td>
							<td class="hidden md:table-cell px-8 py-4 text-center">
								<div class="flex items-center justify-center gap-3">
									{#if !appt.is_visited}
										<div class="flex gap-2">
											<button
												on:click|stopPropagation={() =>
													toggleStatus(appt.id, 'is_present', !appt.is_present)}
												class="px-5 py-2.5 rounded-xl text-[11px] font-black uppercase transition-all
                                {appt.is_present
													? 'bg-orange-500 text-white shadow-orange-100'
													: 'bg-blue-600 text-white shadow-blue-200'} shadow-lg"
											>
												{appt.is_present ? 'অনুপস্থিত' : 'উপস্থিত'}
											</button>
											<button
												on:click|stopPropagation={() => announcePatient(appt)}
												class="px-5 py-2.5 rounded-xl text-[11px] font-black uppercase transition-all bg-indigo-600 text-white shadow-indigo-200 shadow-lg hover:bg-indigo-700 active:scale-95"
											>
												ঘোষণা করুন
											</button>
											<button
												on:click|stopPropagation={() => toggleStatus(appt.id, 'is_visited', true)}
												disabled={!appt.is_present}
												class="px-5 py-2.5 rounded-xl text-[11px] font-black uppercase transition-all
                                {!appt.is_present
													? 'bg-slate-100 text-slate-300'
													: 'bg-slate-900 text-white shadow-slate-200 shadow-lg'}"
											>
												দেখা শেষ
											</button>
										</div>
									{:else}
										<span
											class="text-xs font-black text-slate-400 uppercase tracking-widest bg-slate-100 px-6 py-2 rounded-xl"
											>সম্পন্ন</span
										>
									{/if}
								</div>
							</td>
						</tr>

						{#if selectedApptId === appt.id && !appt.is_visited}
							<tr class="md:hidden {appt.is_present ? 'bg-green-100/50' : 'bg-blue-50/50'}">
								<td
									colspan="2"
									class="px-5 py-5 border-t {appt.is_present
										? 'border-green-200'
										: 'border-blue-100'}"
								>
									<div class="flex gap-3">
										<button
											on:click|stopPropagation={() =>
												toggleStatus(appt.id, 'is_present', !appt.is_present)}
											class="flex-1 py-4 rounded-2xl text-[12px] font-black uppercase shadow-lg
                            {appt.is_present
												? 'bg-orange-500 text-white'
												: 'bg-blue-600 text-white'}"
										>
											{appt.is_present ? 'অনুপস্থিত করুন' : 'উপস্থিত চিহ্নিত করুন'}
										</button>

										<button
											on:click|stopPropagation={() => announcePatient(appt)}
											class="flex-1 py-4 rounded-2xl text-[12px] font-black uppercase shadow-lg bg-indigo-600 text-white active:scale-95"
										>
											ঘোষণা করুন
										</button>
										<button
											on:click|stopPropagation={() => toggleStatus(appt.id, 'is_visited', true)}
											disabled={!appt.is_present}
											class="flex-1 py-4 rounded-2xl text-[12px] font-black uppercase shadow-lg
                            {!appt.is_present
												? 'bg-slate-200 text-slate-400'
												: 'bg-slate-900 text-white'}"
										>
											দেখা শেষ
										</button>
									</div>
								</td>
							</tr>
						{/if}
					{/each}
				</tbody>
			</table>
		</div>
	{:else if currentView === 'book'}
		<div class="flex flex-col lg:grid lg:grid-cols-2 gap-4 md:gap-6">
			<div
				class="bg-white p-5 md:p-10 rounded-[1.5rem] md:rounded-[2rem] shadow-xl border border-slate-100"
			>
				<div class="flex justify-between items-center mb-6">
					<h2 class="text-xl md:text-2xl font-black italic uppercase text-slate-800">
						বুকিং এন্ট্রি
					</h2>
					<span
						class="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest md:hidden"
						>নতুন এন্ট্রি</span
					>
				</div>

				<div class="space-y-4 md:space-y-5">
					<div class="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
						<div class="space-y-1">
							<div class="flex justify-between items-center px-2">
								<label class="text-[10px] font-black text-slate-400 uppercase">তারিখ</label>
								<span
									class="text-[10px] font-black text-blue-600 uppercase bg-blue-50 px-2 py-0.5 rounded-md"
								>
									{getWeekdayBangla(manualEntry.date)}
								</span>
							</div>
							<input
								type="date"
								min={todayStr}
								bind:value={manualEntry.date}
								on:change={handleParamChange}
								class="w-full p-4 bg-slate-50 rounded-2xl font-bold border-2 border-transparent focus:border-blue-500 outline-none text-sm md:text-base"
							/>
						</div>
						<div class="space-y-1">
							<label class="text-[10px] font-black text-slate-400 uppercase ml-2">ক্যাটাগরি</label>
							<select
								bind:value={manualEntry.patient_type}
								on:change={handleParamChange}
								class="w-full p-4 bg-slate-50 rounded-2xl font-bold border-2 border-transparent focus:border-blue-500 outline-none text-sm md:text-base appearance-none"
							>
								<option value="new">New Patient (N-)</option>
								<option value="old">Old Patient (O-)</option>
								<option value="report">Report (R-)</option>
							</select>
						</div>
					</div>

					<div class="space-y-1">
						<label class="text-[10px] font-black text-slate-400 uppercase ml-2">রোগীর নাম</label>
						<input
							bind:value={manualEntry.name}
							placeholder="নাম লিখুন..."
							class="w-full p-4 bg-slate-50 rounded-2xl font-bold outline-none border-2 border-transparent focus:border-blue-500 text-sm md:text-base"
						/>
					</div>

					<div class="grid grid-cols-2 gap-3 md:gap-4">
						<div class="space-y-1">
							<label class="text-[10px] font-black text-slate-400 uppercase ml-2">মোবাইল</label>
							<input
								bind:value={manualEntry.phone}
								type="tel"
								placeholder="017..."
								class="w-full p-4 bg-slate-50 rounded-2xl font-bold outline-none border-2 border-transparent focus:border-blue-500 text-sm md:text-base"
							/>
						</div>
						<div class="space-y-1">
							<label class="text-[10px] font-black text-slate-400 uppercase ml-2">বয়স</label>
							<input
								bind:value={manualEntry.age}
								placeholder="উদাঃ ২৫"
								type="number"
								class="w-full p-4 bg-slate-50 rounded-2xl font-bold outline-none border-2 border-transparent focus:border-blue-500 text-sm md:text-base"
							/>
						</div>
					</div>

					<div
						class="bg-gradient-to-br from-blue-50 to-indigo-50 p-5 rounded-[1.5rem] border-2 border-blue-100 flex items-center justify-between shadow-sm"
					>
						<div class="flex-1">
							<p class="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">
								সিরিয়াল নম্বর
							</p>
							<div class="flex items-center">
								<span class="text-2xl font-black text-blue-300 mr-1"
									>{getPrefix(manualEntry.patient_type)}</span
								>
								<input
									type="number"
									bind:value={manualEntry.serial}
									on:input={() => (isManualEditing = true)}
									class="w-20 text-3xl font-black bg-transparent text-blue-700 outline-none"
								/>
							</div>
						</div>
						<button
							on:click={suggestNextSerial}
							class="bg-white text-blue-600 border-2 border-blue-200 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase shadow-sm active:scale-95"
						>
							অটো ফিল
						</button>
					</div>

					<button
						on:click={handleManualBook}
						class="w-full bg-slate-900 text-white py-4 md:py-5 rounded-2xl font-black uppercase tracking-widest shadow-xl hover:bg-blue-700 transition-all active:scale-[0.98] text-sm md:text-base"
					>
						বুকিং কনফার্ম করুন
					</button>
				</div>
			</div>

			<div
				class="bg-slate-50 p-5 md:p-8 rounded-[1.5rem] md:rounded-[2rem] border border-slate-200 flex flex-col gap-4"
			>
				<h3 class="font-black text-slate-500 uppercase text-[10px] tracking-widest">
					বুকড সিরিয়াল ({manualEntry.date})
				</h3>
				<div class="space-y-4 overflow-y-auto max-h-[300px] md:max-h-[500px] pr-2 custom-scrollbar">
					{#each [['new', 'New Patient', 'text-blue-600', 'bg-blue-100/50'], ['old', 'Old Patient', 'text-slate-600', 'bg-white'], ['report', 'Report', 'text-orange-600', 'bg-orange-100/50']] as [cat, label, color, bg]}
						{#if appointments.filter((a) => (a.patient_type || 'new').toLowerCase() === cat).length > 0}
							<div class="space-y-2">
								<p class="text-[9px] font-black uppercase {color} flex items-center gap-1">
									<span class="w-1.5 h-1.5 rounded-full bg-current"></span>
									{label}
								</p>
								<div class="flex flex-wrap gap-1.5">
									{#each appointments.filter((a) => (a.patient_type || 'new').toLowerCase() === cat) as appt}
										<div
											class="{bg} border border-slate-200/50 shadow-sm px-3 py-2 rounded-lg font-black text-slate-700 text-[11px]"
										>
											{getPrefix(appt.patient_type)}{appt.serial_no}
										</div>
									{/each}
								</div>
							</div>
						{/if}
					{/each}
				</div>
			</div>
		</div>
	{:else if currentView === 'timing'}
		<div
			class="max-w-4xl mx-auto bg-white p-5 md:p-10 rounded-[2rem] shadow-2xl border border-slate-100"
		>
			<div class="flex flex-col md:flex-row justify-between items-center mb-10 gap-4">
				<h2 class="text-2xl md:text-3xl font-black italic uppercase text-slate-800">
					রিপোর্টিং সময় নির্ধারণ
				</h2>
				{#if editingId !== 'new'}<button
						on:click={initiateAdd}
						class="bg-blue-600 text-white px-8 py-3 rounded-full font-black text-xs uppercase shadow-xl"
						>+ নতুন রেঞ্জ</button
					>{/if}
			</div>
			{#if editingId}
				<div class="flex flex-col gap-4 bg-blue-50 p-6 rounded-2xl border-2 border-blue-200 mb-6">
					<div class="grid grid-cols-2 gap-4">
						<select
							bind:value={tempRow.patient_type}
							class="w-full p-3 bg-white rounded-xl font-black"
							><option value="new">New Patient</option><option value="old">Old Patient</option
							><option value="report">Report</option></select
						>
						<input
							bind:value={tempRow.serial_range}
							placeholder="সিরিয়াল রেঞ্জ"
							class="w-full p-3 bg-white rounded-xl font-black shadow-inner"
						/>
					</div>
					<div class="flex gap-2">
						<select bind:value={tempRow.hour} class="flex-1 p-3 rounded-xl font-black"
							>{#each Array(12) as _, i}<option value={(i + 1).toString().padStart(2, '0')}
									>{i + 1}</option
								>{/each}</select
						>
						<select bind:value={tempRow.minute} class="flex-1 p-3 rounded-xl font-black text-center"
							>{#each ['00', '15', '30', '45'] as m}<option value={m}>{m}</option>{/each}</select
						>
						<select
							bind:value={tempRow.period}
							class="flex-1 p-3 rounded-xl font-black text-blue-600"
							><option value="AM">AM</option><option value="PM">PM</option></select
						>
					</div>
					<div class="flex gap-2">
						<button
							on:click={() => saveTiming(editingId)}
							class="flex-1 bg-blue-600 text-white py-3 rounded-xl font-black uppercase text-[10px]"
							>সেভ করুন</button
						>
						<button
							on:click={() => (editingId = null)}
							class="flex-1 text-slate-400 font-bold uppercase text-[10px]">বাতিল</button
						>
					</div>
				</div>
			{/if}
			<div class="space-y-4">
				{#each reportingTimings as row}
					<div
						class="flex flex-col sm:flex-row items-center justify-between bg-white p-5 rounded-2xl border border-slate-100 gap-4"
					>
						<div class="flex items-center gap-3">
							<span
								class="text-[9px] font-black px-2 py-1 rounded uppercase {row.patient_type === 'new'
									? 'bg-blue-100 text-blue-600'
									: row.patient_type === 'report'
										? 'bg-orange-100 text-orange-600'
										: 'bg-slate-100 text-slate-500'}">{row.patient_type}</span
							>
							<span class="font-black text-slate-800 text-xl">সিরিয়াল {row.serial_range}</span>
						</div>
						<div class="bg-blue-50 text-blue-600 px-6 py-2 rounded-xl font-black italic">
							{row.reporting_time}
						</div>
						<div class="flex gap-4">
							<button
								on:click={() => initiateEdit(row)}
								class="text-blue-500 font-black text-xs uppercase">এডিট</button
							>
							<button
								on:click={() => deleteTiming(row.id)}
								class="text-red-300 font-black text-xs uppercase">ডিলিট</button
							>
						</div>
					</div>
				{/each}
			</div>
		</div>
	{:else if currentView === 'maker'}
		<div class="flex flex-col lg:grid lg:grid-cols-2 gap-8">
			<div class="bg-white p-6 md:p-8 rounded-[2rem] shadow-xl border border-slate-100 space-y-6">
				<div class="flex justify-between items-center">
					<h2 class="text-2xl font-black text-slate-800 uppercase italic">শিডিউল মেকার</h2>
					{#if form.id}<button
							on:click={resetForm}
							class="text-[10px] bg-slate-100 px-3 py-1 rounded-full font-black uppercase text-slate-400 tracking-widest"
							>এডিট বাতিল</button
						>{/if}
				</div>
				<div class="grid grid-cols-2 gap-4">
					<div class="space-y-1">
						<label class="text-[10px] font-black text-slate-400 uppercase ml-2">বার নির্বাচন</label>
						<select
							bind:value={form.day_of_week}
							class="w-full bg-slate-50 p-4 rounded-2xl font-bold border-none outline-none"
							>{#each dayNames as day, i}<option value={i}>{day}</option>{/each}</select
						>
					</div>
					<div class="space-y-1">
						<label class="text-[10px] font-black text-slate-400 uppercase ml-2">সর্বোচ্চ রোগী</label
						>
						<input
							type="number"
							bind:value={form.max_patients}
							class="w-full bg-slate-50 p-4 rounded-2xl font-bold border-none outline-none"
						/>
					</div>
				</div>
				<div class="grid grid-cols-2 gap-4">
					<div class="space-y-1">
						<label class="text-[10px] font-black text-slate-400 uppercase ml-2">চেম্বার শুরু</label>
						<input
							type="time"
							bind:value={form.visitation_start}
							class="w-full bg-slate-50 p-4 rounded-2xl font-bold outline-none"
						/>
					</div>
					<div class="space-y-1">
						<label class="text-[10px] font-black text-slate-400 uppercase ml-2">চেম্বার শেষ</label>
						<input
							type="time"
							bind:value={form.visitation_end}
							class="w-full bg-slate-50 p-4 rounded-2xl font-bold outline-none"
						/>
					</div>
				</div>
				<div class="p-6 bg-blue-50 rounded-[2rem] border-2 border-blue-100 space-y-4">
					<div class="flex justify-between items-center">
						<h3 class="font-black text-blue-700 text-xs uppercase tracking-widest">বুকিং মোড</h3>
						<div class="flex bg-white p-1 rounded-xl shadow-sm border border-blue-50">
							<button
								on:click={() => (form.booking_window_type = 'specific_day')}
								class="px-4 py-2 text-[10px] font-black uppercase rounded-lg transition-all {form.booking_window_type ===
								'specific_day'
									? 'bg-blue-600 text-white shadow-md'
									: 'text-slate-400'}">নির্ধারিত</button
							>
							<button
								on:click={() => (form.booking_window_type = 'anytime')}
								class="px-4 py-2 text-[10px] font-black uppercase rounded-lg transition-all {form.booking_window_type ===
								'anytime'
									? 'bg-blue-600 text-white shadow-md'
									: 'text-slate-400'}">যেকোনো সময়</button
							>
						</div>
					</div>
					<div class="pt-2">
						{#if form.booking_window_type === 'anytime'}
							<div class="space-y-2">
								<label class="text-[10px] font-black text-blue-400 uppercase ml-2 italic"
									>কতদিন আগে দেখা যাবে?</label
								>
								<input
									type="number"
									bind:value={form.booking_day_offset}
									placeholder="উদাঃ ৩০"
									class="w-full p-4 bg-white rounded-2xl font-bold shadow-sm outline-none border-2 border-blue-100"
								/>
							</div>
						{:else}
							<div class="grid grid-cols-2 gap-4">
								<div class="space-y-1">
									<label class="text-[10px] font-black text-blue-400 uppercase ml-2"
										>কতদিন আগে খুলবে?</label
									>
									<select
										bind:value={form.booking_day_offset}
										class="w-full p-4 bg-white rounded-2xl font-bold shadow-sm"
									>
										{#each [0, 1, 2, 3, 4, 5, 6] as d}<option value={d}
												>{d === 0 ? 'সেদিন' : d + ' দিন আগে'}</option
											>{/each}
									</select>
								</div>
								<div class="space-y-1">
									<label class="text-[10px] font-black text-blue-400 uppercase ml-2"
										>কখন শুরু হবে?</label
									>
									<input
										type="time"
										bind:value={form.booking_start_time}
										class="w-full p-4 bg-white rounded-2xl font-bold shadow-sm"
									/>
								</div>
							</div>
						{/if}
					</div>
				</div>
				<button
					on:click={saveSchedule}
					class="w-full {form.id
						? 'bg-orange-600'
						: 'bg-blue-700'} text-white font-black uppercase tracking-widest py-5 rounded-[2rem] shadow-xl"
					>{form.id ? 'আপডেট করুন' : 'তৈরি করুন'}</button
				>
			</div>
			<div class="space-y-4">
				{#each schedules as s}
					<div
						class="bg-white p-6 rounded-[2rem] border border-slate-100 flex flex-col gap-4 shadow-sm {!s.is_active
							? 'opacity-60 grayscale'
							: ''}"
					>
						<div class="flex justify-between items-start">
							<div>
								<h4 class="font-black text-blue-600 uppercase text-sm">
									{dayNames[s.day_of_week]}
								</h4>
								<p class="text-lg font-bold">
									{format12hBangla(s.visitation_start)} — {format12hBangla(s.visitation_end)}
								</p>
							</div>
							<div class="flex gap-2">
								<button
									on:click={() => editSchedule(s)}
									class="text-blue-500 font-black text-xs uppercase p-1">এডিট</button
								>
								<button
									on:click={() => deleteSchedule(s.id)}
									class="text-red-300 font-black text-xs uppercase p-1">ডিলিট</button
								>
							</div>
						</div>
						<div class="flex items-center justify-between pt-4 border-t border-slate-50">
							<div class="flex flex-col">
								<p class="text-[9px] font-black uppercase text-blue-400">
									{s.booking_window_type === 'anytime' ? '🔓 Anytime' : '📅 Scheduled'}
								</p>
								<p class="text-[9px] text-slate-400 font-bold uppercase">
									{s.booking_day_offset} দিন আগে {#if s.booking_window_type === 'specific_day'}• {format12hBangla(
											s.booking_start_time
										)}{/if}
								</p>
							</div>
							<button
								on:click={() => toggleScheduleActive(s.id, s.is_active)}
								class="h-6 w-11 rounded-full transition-colors {s.is_active
									? 'bg-blue-600'
									: 'bg-slate-300'} relative"
							>
								<span
									class="absolute top-1 left-1 h-4 w-4 rounded-full bg-white transition-transform {s.is_active
										? 'translate-x-5'
										: ''}"
								></span>
							</button>
						</div>
					</div>
				{/each}
			</div>
		</div>
	{:else if currentView === 'slots'}
		<div class="max-w-2xl mx-auto py-4 md:py-10">
			<div class="bg-white p-6 md:p-10 rounded-[2rem] shadow-2xl border border-slate-100 space-y-6">
				<h2 class="text-xl md:text-2xl font-black text-slate-800 uppercase tracking-tighter">
					অনলাইন সিরিয়াল রেঞ্জ
				</h2>
				<div class="space-y-4">
					{#each [['new_patient', 'New Patient', 'text-blue-500'], ['old_patient', 'Old Patient', 'text-slate-400'], ['report', 'Report', 'text-orange-500']] as [key, label, color]}
						<div class="space-y-1">
							<label class="text-[10px] font-black {color} uppercase ml-2">{label}</label>
							<input
								type="text"
								bind:value={slots[key]}
								class="w-full bg-slate-50 border-2 border-transparent rounded-2xl p-4 text-lg font-mono outline-none"
								placeholder="উদাঃ ১-১০"
							/>
						</div>
					{/each}
				</div>
				<button
					on:click={saveUniversalSlots}
					class="w-full bg-slate-900 text-white py-5 rounded-2xl font-black uppercase tracking-widest shadow-xl mt-6"
					>রুলস আপডেট করুন</button
				>
			</div>
		</div>
	{/if}
</div>

<style>
	.no-scrollbar::-webkit-scrollbar {
		display: none;
	}
	.no-scrollbar {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}
	@import url('https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&display=swap');
	:global(body) {
		font-family: 'Hind Siliguri', sans-serif;
		background-color: #f8fafc;
	}
</style>
