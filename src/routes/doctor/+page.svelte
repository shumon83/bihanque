<script>
	import { supabase } from '$lib/supabase';
	import { onMount } from 'svelte';

	let appointments = [];
	let onLeave = false;
	let leaveMessage = '';
	let showStatusModal = false;
	let showLeaveModal = false;
	let showProfileModal = false;
	let loading = false;
	let today = new Date().toLocaleDateString('en-CA');

	// --- Doctor Profile State ---
	let profile = {
		name: '',
		speciality: '',
		degrees: '',
		designation: '',
		specialization_details: '',
		practicing_center: '',
		fees_details: '',
		regular_schedule: '',
		photo_url: ''
	};

	let futureLeaves = [];
	let newLeave = { start_date: '', end_date: '', message: '' };

	// --- Reactive Counters (Updated) ---
	$: totalPatients = appointments.length;
	$: presentCount = appointments.filter((a) => a.is_present && !a.is_visited).length;
	$: finishedCount = appointments.filter((a) => a.is_visited).length;

	// টাইপ ভিত্তিক কাউন্টার
	$: newCount = appointments.filter((a) => a.patient_type?.toLowerCase() === 'new').length;
	$: oldCount = appointments.filter((a) => a.patient_type?.toLowerCase() === 'old').length;
	$: reportCount = appointments.filter((a) => a.patient_type?.toLowerCase() === 'report').length;

	onMount(() => {
		fetchStatus();
		fetchLiveQueue();
		fetchFutureLeaves();
		fetchProfile();
		setupRealtime();
	});

	async function fetchProfile() {
		const { data } = await supabase.from('doctor_profile').select('*').single();
		if (data) profile = data;
	}

	async function saveProfile() {
		loading = true;
		const { error } = await supabase.from('doctor_profile').update(profile).eq('id', profile.id);
		if (!error) showProfileModal = false;
		loading = false;
	}

	async function fetchStatus() {
		const { data } = await supabase.from('doctor_status').select('*').single();
		if (data) {
			onLeave = data.is_on_leave;
			leaveMessage = data.leave_message;
		}
	}

	async function fetchLiveQueue() {
		const { data } = await supabase
			.from('appointments')
			.select('*')
			.eq('appointment_date', today)
			// প্রথমে টাইপ অনুযায়ী, তারপর সিরিয়াল অনুযায়ী সাজানো
			.order('patient_type', { ascending: true })
			.order('serial_no', { ascending: true });
		appointments = data || [];
	}

	async function fetchFutureLeaves() {
		const { data } = await supabase
			.from('leave_periods')
			.select('*')
			.gte('end_date', today)
			.order('start_date', { ascending: true });
		futureLeaves = data || [];
	}

	async function addFutureLeave() {
		if (!newLeave.start_date || !newLeave.end_date) return alert('Please select a date range');
		loading = true;
		await supabase.from('leave_periods').insert([newLeave]);
		newLeave = { start_date: '', end_date: '', message: '' };
		loading = false;
		fetchFutureLeaves();
	}

	async function deleteLeave(id) {
		if (confirm('Cancel this scheduled leave?')) {
			await supabase.from('leave_periods').delete().eq('id', id);
			fetchFutureLeaves();
		}
	}

	function setupRealtime() {
		const channel = supabase
			.channel('doctor-live-queue')
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'appointments',
					filter: `appointment_date=eq.${today}`
				},
				() => fetchLiveQueue()
			)
			.subscribe();
		return () => {
			supabase.removeChannel(channel);
		};
	}

	async function updateStatus() {
		loading = true;
		await supabase
			.from('doctor_status')
			.update({ is_on_leave: onLeave, leave_message: leaveMessage })
			.eq('id', 1);
		showStatusModal = false;
		loading = false;
	}

	// হেল্পার ফাংশন সিরিয়াল প্রিফিক্স এর জন্য
	function getSerialDisplay(type, no) {
		const prefix =
			type?.toLowerCase() === 'new'
				? 'N'
				: type?.toLowerCase() === 'old'
					? 'O'
					: type?.toLowerCase() === 'report'
						? 'R'
						: '';
		return `${prefix}#${no}`;
	}
</script>

<div class="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
	<div
		class="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-slate-100 pb-8"
	>
		<div class="flex items-center gap-5">
			<button on:click={() => (showProfileModal = true)} class="relative group">
				<div
					class="h-16 w-16 rounded-2xl bg-blue-100 overflow-hidden border-2 border-white shadow-md transition group-hover:scale-105 group-hover:border-blue-400"
				>
					{#if profile.photo_url}
						<img src={profile.photo_url} alt="Doctor" class="h-full w-full object-cover" />
					{:else}
						<div class="h-full w-full flex items-center justify-center text-blue-400 font-black">
							DR
						</div>
					{/if}
				</div>
				<div
					class="absolute -bottom-1 -right-1 bg-blue-600 text-white p-1 rounded-lg opacity-0 group-hover:opacity-100 transition"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-3 w-3"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="3"
							d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
						/>
					</svg>
				</div>
			</button>

			<div>
				<h1
					class="text-3xl font-black text-slate-900 uppercase italic tracking-tighter leading-none"
				>
					{profile.name || 'Doctor Console'}
				</h1>
				<p class="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mt-2">
					{profile.designation || 'Live Practice Management'}
				</p>
			</div>
		</div>

		<div class="flex flex-wrap gap-3">
			<button
				on:click={() => (showLeaveModal = true)}
				class="flex items-center gap-3 px-5 py-3 rounded-2xl bg-slate-900 text-white transition hover:scale-95 shadow-lg shadow-slate-200"
			>
				<span class="text-[10px] font-black uppercase tracking-widest">Plan Leave</span>
				{#if futureLeaves.length > 0}
					<span
						class="bg-blue-600 text-white text-[10px] h-5 w-5 flex items-center justify-center rounded-full ml-1"
						>{futureLeaves.length}</span
					>
				{/if}
			</button>

			<button
				on:click={() => (showStatusModal = true)}
				class="flex items-center gap-4 px-5 py-3 rounded-2xl bg-white border-2 border-slate-100 transition hover:border-blue-200 shadow-sm"
			>
				<div class="relative flex h-2.5 w-2.5">
					<span
						class="animate-ping absolute inline-flex h-full w-full rounded-full {onLeave
							? 'bg-red-400'
							: 'bg-green-400'} opacity-75"
					></span>
					<span
						class="relative inline-flex rounded-full h-2.5 w-2.5 {onLeave
							? 'bg-red-500'
							: 'bg-green-500'}"
					></span>
				</div>
				<div class="text-left">
					<p class="text-[9px] font-black text-slate-400 uppercase leading-none mb-0.5">Status</p>
					<p class="text-[11px] font-black uppercase {onLeave ? 'text-red-600' : 'text-green-600'}">
						{onLeave ? 'On Leave' : 'Practicing'}
					</p>
				</div>
			</button>
		</div>
	</div>

	<div class="sticky top-4 z-40 grid grid-cols-3 gap-3 md:gap-6 py-2">
		<div
			class="bg-white/95 backdrop-blur-md border-2 border-slate-100 p-4 rounded-[2.5rem] shadow-xl flex flex-col items-center justify-center text-center"
		>
			<span class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1"
				>Total Booked</span
			>
			<span class="text-4xl font-black text-slate-900 leading-none">{totalPatients}</span>
			<div class="flex gap-3 mt-3 pt-2 border-t border-slate-50 w-full justify-center">
				<div class="text-center">
					<p class="text-[8px] font-black text-blue-500 uppercase">New</p>
					<p class="text-xs font-bold text-slate-700">
						{appointments.filter((a) => a.patient_type?.toLowerCase() === 'new').length}
					</p>
				</div>
				<div class="text-center">
					<p class="text-[8px] font-black text-orange-500 uppercase">Old</p>
					<p class="text-xs font-bold text-slate-700">
						{appointments.filter((a) => a.patient_type?.toLowerCase() === 'old').length}
					</p>
				</div>
				<div class="text-center">
					<p class="text-[8px] font-black text-purple-500 uppercase">Rep</p>
					<p class="text-xs font-bold text-slate-700">
						{appointments.filter((a) => a.patient_type?.toLowerCase() === 'report').length}
					</p>
				</div>
			</div>
		</div>

		<div
			class="bg-blue-600 p-4 rounded-[2.5rem] shadow-xl shadow-blue-200 flex flex-col items-center justify-center text-white text-center"
		>
			<span class="text-[10px] font-black text-blue-100 uppercase tracking-widest mb-1"
				>In Clinic</span
			>
			<span class="text-4xl font-black leading-none">{presentCount}</span>
			<div class="flex gap-3 mt-3 pt-2 border-t border-blue-500/50 w-full justify-center">
				<div class="text-center">
					<p class="text-[8px] font-black text-blue-100 uppercase">New</p>
					<p class="text-sm font-black">
						{appointments.filter(
							(a) => a.is_present && !a.is_visited && a.patient_type?.toLowerCase() === 'new'
						).length}
					</p>
				</div>
				<div class="text-center">
					<p class="text-[8px] font-black text-blue-100 uppercase">Old</p>
					<p class="text-sm font-black">
						{appointments.filter(
							(a) => a.is_present && !a.is_visited && a.patient_type?.toLowerCase() === 'old'
						).length}
					</p>
				</div>
				<div class="text-center">
					<p class="text-[8px] font-black text-blue-100 uppercase">Rep</p>
					<p class="text-sm font-black">
						{appointments.filter(
							(a) => a.is_present && !a.is_visited && a.patient_type?.toLowerCase() === 'report'
						).length}
					</p>
				</div>
			</div>
		</div>

		<div
			class="bg-slate-900 p-4 rounded-[2.5rem] shadow-xl shadow-slate-200 flex flex-col items-center justify-center text-white text-center"
		>
			<span class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1"
				>Visited</span
			>
			<span class="text-4xl font-black leading-none">{finishedCount}</span>
			<div class="flex gap-3 mt-3 pt-2 border-t border-slate-700 w-full justify-center">
				<div class="text-center">
					<p class="text-[8px] font-black text-slate-500 uppercase">New</p>
					<p class="text-sm font-black">
						{appointments.filter((a) => a.is_visited && a.patient_type?.toLowerCase() === 'new')
							.length}
					</p>
				</div>
				<div class="text-center">
					<p class="text-[8px] font-black text-slate-500 uppercase">Old</p>
					<p class="text-sm font-black">
						{appointments.filter((a) => a.is_visited && a.patient_type?.toLowerCase() === 'old')
							.length}
					</p>
				</div>
				<div class="text-center">
					<p class="text-[8px] font-black text-slate-500 uppercase">Rep</p>
					<p class="text-sm font-black">
						{appointments.filter((a) => a.is_visited && a.patient_type?.toLowerCase() === 'report')
							.length}
					</p>
				</div>
			</div>
		</div>
	</div>
	<section class="space-y-4 pt-4">
		<div class="flex items-center justify-between px-2">
			<div class="flex items-center gap-2">
				<div class="h-4 w-1 bg-blue-600 rounded-full"></div>
				<h2 class="text-lg font-black text-slate-800 uppercase italic tracking-tighter">
					Live Queue
				</h2>
			</div>
			<div
				class="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-3 py-1 rounded-full"
			>
				{today}
			</div>
		</div>

		<div class="bg-white rounded-[2.5rem] shadow-xl border border-slate-100 overflow-hidden">
			<table class="w-full text-left">
				<thead>
					<tr class="bg-slate-50 border-b border-slate-100">
						<th class="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest"
							>Serial</th
						>
						<th class="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest"
							>Patient Details</th
						>
						<th
							class="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center"
							>Status</th
						>
					</tr>
				</thead>
				<tbody class="divide-y divide-slate-50">
					{#each appointments as appt}
						<tr
							class="transition-all {appt.is_visited
								? 'opacity-40 grayscale'
								: 'hover:bg-blue-50/40'}"
						>
							<td class="px-6 py-5">
								<div class="flex flex-col">
									<span
										class="text-2xl font-black {appt.is_visited
											? 'text-slate-300'
											: 'text-blue-600'}"
									>
										{getSerialDisplay(appt.patient_type, appt.serial_no)}
									</span>
									<span
										class="text-[8px] font-black uppercase tracking-tighter
										{appt.patient_type?.toLowerCase() === 'new'
											? 'text-blue-400'
											: appt.patient_type?.toLowerCase() === 'old'
												? 'text-orange-400'
												: 'text-purple-400'}"
									>
										{appt.patient_type || 'New'}
									</span>
								</div>
							</td>
							<td class="px-8 py-6">
								<div class="font-bold text-slate-800 text-lg leading-none mb-1">
									{appt.patient_name}
								</div>
								<div class="text-[10px] font-black text-slate-400 uppercase tracking-widest">
									{appt.age ? appt.age + ' Years Old' : 'Age unknown'} • {appt.patient_phone || ''}
								</div>
							</td>
							<td class="px-6 py-5 text-center">
								{#if appt.is_visited}
									<span
										class="px-3 py-1 bg-slate-100 text-slate-500 text-[9px] font-black uppercase rounded-lg"
										>Done</span
									>
								{:else if appt.is_present}
									<span
										class="px-3 py-1 bg-green-100 text-green-700 text-[9px] font-black uppercase rounded-lg"
										>In Clinic</span
									>
								{:else}
									<span
										class="px-3 py-1 bg-slate-50 text-slate-300 text-[9px] font-black uppercase rounded-lg italic"
										>Waiting</span
									>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
			{#if appointments.length === 0}
				<div class="p-20 text-center text-slate-300 font-bold uppercase tracking-widest text-xs">
					No appointments today
				</div>
			{/if}
		</div>
	</section>

	{#if showProfileModal}
		<div
			class="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[60] flex items-center justify-center p-4"
		>
			<div
				class="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-in zoom-in duration-200 custom-scroll"
			>
				<div class="p-8">
					<h3
						class="text-2xl font-black text-slate-900 uppercase italic tracking-tighter mb-8 border-b pb-4"
					>
						Doctor Profile
					</h3>
					<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
						<div class="space-y-4">
							<div class="space-y-1">
								<label class="text-[10px] font-black text-slate-400 uppercase ml-2">Full Name</label
								>
								<input
									bind:value={profile.name}
									class="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-3 text-sm font-bold outline-none"
								/>
							</div>
							<div class="space-y-1">
								<label class="text-[10px] font-black text-slate-400 uppercase ml-2"
									>Speciality</label
								>
								<input
									bind:value={profile.speciality}
									class="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-3 text-sm font-bold outline-none"
								/>
							</div>
							<div class="space-y-1">
								<label class="text-[10px] font-black text-slate-400 uppercase ml-2"
									>Designation</label
								>
								<input
									bind:value={profile.designation}
									class="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-3 text-sm font-bold outline-none"
								/>
							</div>
							<div class="space-y-1">
								<label class="text-[10px] font-black text-slate-400 uppercase ml-2">Degrees</label>
								<input
									bind:value={profile.degrees}
									class="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-3 text-sm font-bold outline-none"
								/>
							</div>
						</div>
						<div class="space-y-4">
							<div class="space-y-1">
								<label class="text-[10px] font-black text-slate-400 uppercase ml-2"
									>Practicing Center</label
								>
								<input
									bind:value={profile.practicing_center}
									class="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-3 text-sm font-bold outline-none"
								/>
							</div>
							<div class="space-y-1">
								<label class="text-[10px] font-black text-slate-400 uppercase ml-2"
									>Consultation Fees</label
								>
								<input
									bind:value={profile.fees_details}
									class="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-3 text-sm font-bold outline-none"
								/>
							</div>
							<div class="space-y-1">
								<label class="text-[10px] font-black text-slate-400 uppercase ml-2">Photo URL</label
								>
								<input
									bind:value={profile.photo_url}
									placeholder="https://..."
									class="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-3 text-sm font-bold outline-none"
								/>
							</div>
							<div class="space-y-1">
								<label class="text-[10px] font-black text-slate-400 uppercase ml-2"
									>Regular Schedule</label
								>
								<input
									bind:value={profile.regular_schedule}
									placeholder="Sat - Thu..."
									class="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-3 text-sm font-bold outline-none"
								/>
							</div>
						</div>
					</div>
					<div class="mt-6 space-y-1">
						<label class="text-[10px] font-black text-slate-400 uppercase ml-2"
							>Specialization Details</label
						>
						<textarea
							bind:value={profile.specialization_details}
							rows="3"
							class="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-3 text-sm font-bold outline-none"
						></textarea>
					</div>
				</div>
				<div class="bg-slate-50 p-6 flex gap-3">
					<button
						on:click={() => (showProfileModal = false)}
						class="flex-1 font-bold text-slate-400 uppercase text-xs">Close</button
					>
					<button
						on:click={saveProfile}
						class="flex-1 bg-blue-600 text-white py-4 rounded-2xl font-black uppercase text-xs tracking-widest shadow-lg"
						>Save Profile</button
					>
				</div>
			</div>
		</div>
	{/if}

	{#if showStatusModal}
		<div
			class="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4"
		>
			<div
				class="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-200"
			>
				<div class="p-8">
					<h3 class="text-2xl font-black text-slate-900 uppercase italic tracking-tighter mb-6">
						Clinic Status
					</h3>
					<div class="space-y-3">
						<button
							on:click={() => (onLeave = false)}
							class="w-full flex items-center p-5 border-2 rounded-[1.5rem] transition-all {!onLeave
								? 'border-blue-600 bg-blue-50'
								: 'border-slate-100'}"
						>
							<div
								class="h-5 w-5 rounded-full border-4 border-white {!onLeave
									? 'bg-blue-600'
									: 'bg-slate-200'}"
							></div>
							<span class="ml-4 font-black text-slate-900 uppercase text-sm">Practicing</span>
						</button>
						<button
							on:click={() => (onLeave = true)}
							class="w-full flex items-center p-5 border-2 rounded-[1.5rem] transition-all {onLeave
								? 'border-red-600 bg-red-50'
								: 'border-slate-100'}"
						>
							<div
								class="h-5 w-5 rounded-full border-4 border-white {onLeave
									? 'bg-red-600'
									: 'bg-slate-200'}"
							></div>
							<span class="ml-4 font-black text-slate-900 uppercase text-sm">On Leave</span>
						</button>
						{#if onLeave}
							<textarea
								bind:value={leaveMessage}
								class="w-full mt-4 p-4 border-2 border-slate-100 rounded-2xl text-sm font-medium focus:border-red-400 outline-none"
								placeholder="Notice for patients..."
							></textarea>
						{/if}
					</div>
				</div>
				<div class="bg-slate-50 p-6 flex gap-3">
					<button
						on:click={() => (showStatusModal = false)}
						class="flex-1 font-bold text-slate-400 uppercase text-xs">Cancel</button
					>
					<button
						on:click={updateStatus}
						class="flex-1 bg-slate-900 text-white py-4 rounded-2xl font-black uppercase text-xs tracking-widest shadow-lg"
						>Update</button
					>
				</div>
			</div>
		</div>
	{/if}

	{#if showLeaveModal}
		<div
			class="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-50 flex items-center justify-center p-4"
		>
			<div
				class="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in duration-200"
			>
				<div class="p-8">
					<div class="flex justify-between items-center mb-8">
						<h3 class="text-2xl font-black text-slate-900 uppercase italic tracking-tighter">
							Schedule Leave
						</h3>
						<button
							on:click={() => (showLeaveModal = false)}
							class="text-slate-300 hover:text-slate-600"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-6 w-6"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M6 18L18 6M6 6l12 12"
								/>
							</svg>
						</button>
					</div>
					<div class="grid grid-cols-2 gap-4 mb-4">
						<div class="space-y-1">
							<label class="text-[10px] font-black text-slate-400 uppercase ml-2">Start Date</label>
							<input
								type="date"
								bind:value={newLeave.start_date}
								class="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-3 text-sm font-bold outline-none"
							/>
						</div>
						<div class="space-y-1">
							<label class="text-[10px] font-black text-slate-400 uppercase ml-2">End Date</label>
							<input
								type="date"
								bind:value={newLeave.end_date}
								class="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-3 text-sm font-bold outline-none"
							/>
						</div>
					</div>
					<div class="space-y-1 mb-6">
						<label class="text-[10px] font-black text-slate-400 uppercase ml-2"
							>Notice Message</label
						>
						<input
							bind:value={newLeave.message}
							class="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-3 text-sm outline-none"
						/>
					</div>
					<button
						on:click={addFutureLeave}
						class="w-full bg-blue-600 text-white py-4 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] mb-8"
						>{loading ? 'Adding...' : 'Add to Schedule'}</button
					>

					{#if futureLeaves.length > 0}
						<div class="border-t border-slate-100 pt-6 space-y-3">
							<p class="text-[9px] font-black text-slate-400 uppercase tracking-widest">
								Upcoming Ranges
							</p>
							<div class="max-h-[160px] overflow-y-auto pr-2 space-y-2 custom-scroll">
								{#each futureLeaves as leave}
									<div class="flex justify-between items-center p-3 bg-slate-50 rounded-xl">
										<div class="text-[11px] font-bold text-slate-800">
											{new Date(leave.start_date).toLocaleDateString('en-GB', {
												day: 'numeric',
												month: 'short'
											})} — {new Date(leave.end_date).toLocaleDateString('en-GB', {
												day: 'numeric',
												month: 'short'
											})}
										</div>
										<button on:click={() => deleteLeave(leave.id)} class="text-red-400 p-1">
											<svg
												xmlns="http://www.w3.org/2000/svg"
												class="h-4 w-4"
												fill="none"
												viewBox="0 0 24 24"
												stroke="currentColor"
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2"
													d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
												/>
											</svg>
										</button>
									</div>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	@import url('https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&display=swap');

	:global(body) {
		font-family: 'Hind Siliguri', sans-serif;
		background-color: #f8fafc;
	}

	.custom-scroll::-webkit-scrollbar {
		width: 4px;
	}
	.custom-scroll::-webkit-scrollbar-track {
		background: transparent;
	}
	.custom-scroll::-webkit-scrollbar-thumb {
		background: #e2e8f0;
		border-radius: 10px;
	}
</style>
