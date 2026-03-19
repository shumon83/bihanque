<script>
	import { supabase } from '$lib/supabase';
	import { onMount } from 'svelte';


	let step = 1;
	let loading = false;
	let statusMsg = '';
	let downloading = false;

	// --- State Management ---
	let doctor = {
		name: 'লোড হচ্ছে...',
		speciality: '',
		degrees: '',
		designation: '',
		fees_details: '',
		regular_schedule: '',
		practicing_center: '',
		photo_url: ''
	};

	let name = '';
	let phone = '';
	let age = '';
	let selectedDate = new Date().toLocaleDateString('en-CA');
	let patientType = 'new';

	let previewSerial = null;
	let isVerified = false;
	let reportingTimings = [];

	// --- Refs ---
	let dateInput;

	// --- Security (Turnstile) ---
	let turnstileToken = '';
	const SITE_KEY = '0x4AAAAAACs1tg1FG9OIEcpZ';

	// --- Transliteration State ---
	let suggestions = [];
	let showSuggestions = false;
	let debounceTimer;

	const patientTypes = [
		{ id: 'new', label: 'নতুন', prefix: 'N' },
		{ id: 'old', label: 'পুরাতন', prefix: 'O' },
		{ id: 'report', label: 'রিপোর্ট', prefix: 'R' }
	];

	onMount(() => {
		fetchDoctorProfile();
		fetchReportingTimings();
		if (window.turnstile) renderTurnstile();
	});

	function renderTurnstile() {
		window.turnstile.render('#turnstile-widget', {
			sitekey: SITE_KEY,
			callback: (token) => {
				turnstileToken = token;
			}
		});
	}

	function openCalendar() {
		if (dateInput.showPicker) dateInput.showPicker();
		else dateInput.click();
	}

	async function fetchDoctorProfile() {
		const { data } = await supabase.from('doctor_profile').select('*').single();
		if (data) doctor = data;
	}

	async function fetchReportingTimings() {
		const { data } = await supabase
			.from('reporting_timings')
			.select('*')
			.order('sort_order', { ascending: true });
		reportingTimings = data || [];
	}

	async function handleNameInput(event) {
		name = event.target.value;
		clearTimeout(debounceTimer);
		if (!name.trim()) {
			suggestions = [];
			showSuggestions = false;
			return;
		}
		debounceTimer = setTimeout(async () => {
			try {
				const url = `https://inputtools.google.com/request?text=${encodeURIComponent(name)}&itc=bn-t-i0-und&num=5&cp=0&cs=1&ie=utf-8&oe=utf-8&app=test`;
				const res = await fetch(url);
				const data = await res.json();
				if (data[0] === 'SUCCESS') {
					suggestions = data[1][0][1];
					showSuggestions = suggestions.length > 0;
				}
			} catch (e) {
				console.error(e);
			}
		}, 300);
	}

	function selectSuggestion(word) {
		name = word;
		showSuggestions = false;
		suggestions = [];
	}

	function getDayNameBangla(dateString) {
		const days = ['রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার'];
		return days[new Date(dateString).getDay()];
	}

	function getTimePhaseBangla(hour) {
		if (hour >= 5 && hour < 12) return 'সকাল';
		if (hour >= 12 && hour < 15) return 'দুপুর';
		if (hour >= 15 && hour < 18) return 'বিকাল';
		if (hour >= 18 && hour < 20) return 'সন্ধ্যা';
		return 'রাত';
	}

	function format12h(timeStr) {
		if (!timeStr) return '';
		const [hh, mm] = timeStr.split(':');
		let hour = parseInt(hh);
		const phase = getTimePhaseBangla(hour);
		let displayHour = hour % 12 || 12;
		return `${phase} ${displayHour}:${mm} ${hour >= 12 ? 'PM' : 'AM'}`;
	}

	function parseRange(csv) {
		if (!csv) return [];
		const nums = new Set();
		csv.split(',').forEach((part) => {
			const range = part.trim().split('-');
			if (range.length === 2) {
				for (let i = parseInt(range[0]); i <= parseInt(range[1]); i++) nums.add(i);
			} else {
				const val = parseInt(part.trim());
				if (!isNaN(val)) nums.add(val);
			}
		});
		return Array.from(nums).sort((a, b) => a - b);
	}

	function formatDateBangla(dateString) {
		return new Date(dateString).toLocaleDateString('bn-BD', {
			day: 'numeric',
			month: 'long',
			year: 'numeric'
		});
	}

	function findTimeForSerial(serialStr) {
		if (!serialStr) return 'চেক করা হচ্ছে...';

		// Extract the number part (e.g., from "N-15" it gets 15)
		const serialNum = parseInt(serialStr.split('-')[1]);
		if (isNaN(serialNum)) return 'সিরিয়াল লোড হচ্ছে...';

		for (let row of reportingTimings) {
			// .replace(/\s/g, '') removes any accidental spaces in your database string
			const parts = row.serial_range.replace(/\s/g, '').split('-');

			if (parts.length === 2) {
				// It's a range (e.g., "11-20")
				const start = parseInt(parts[0]);
				const end = parseInt(parts[1]);
				if (serialNum >= start && serialNum <= end) return row.reporting_time;
			} else {
				// It's a single number (e.g., "21")
				const singleVal = parseInt(parts[0]);
				if (serialNum === singleVal) return row.reporting_time;
			}
		}
		return 'চেম্বারে এসে যোগাযোগ করুন';
	}

	async function handleDateChange() {
		statusMsg = '';
		const dayIdx = new Date(selectedDate).getDay();
		const { data } = await supabase
			.from('doctor_schedules')
			.select('is_active')
			.eq('day_of_week', dayIdx)
			.single();
		if (!data || !data.is_active)
			statusMsg = `${getDayNameBangla(selectedDate)} বারে সিরিয়াল বুকিং বন্ধ।`;
	}

	async function previewBooking() {
		if (!name || !phone || !age || !selectedDate) {
			statusMsg = 'সব তথ্য সঠিকভাবে পূরণ করুন।';
			return;
		}
		loading = true;
		statusMsg = '';
		previewSerial = null;

		try {
			// --- STEP 1: GENERAL DOCTOR STATUS ---
			const { data: status } = await supabase.from('doctor_status').select('*').single();
			if (status?.is_on_leave) throw new Error(`দুঃখিত, ডাক্তার বর্তমানে চেম্বারে নেই।`);

			// --- STEP 2: PLANNED LEAVE PERIODS ---
			const { data: plannedLeave } = await supabase
				.from('leave_periods')
				.select('*')
				.lte('start_date', selectedDate)
				.gte('end_date', selectedDate)
				.maybeSingle();

			if (plannedLeave) {
				throw new Error(
					`দুঃখিত, ডাক্তার আগামী ${formatDateBangla(plannedLeave.start_date)} থেকে ${formatDateBangla(plannedLeave.end_date)} পর্যন্ত ছুটিতে থাকবেন।`
				);
			}

			// --- STEP 3: WEEKLY SCHEDULE & BOOKING WINDOW ---
			const dayIdx = new Date(selectedDate).getDay();
			const { data: schedule } = await supabase
				.from('doctor_schedules')
				.select('*')
				.eq('day_of_week', dayIdx)
				.eq('is_active', true)
				.single();

			if (!schedule)
				throw new Error(`${getDayNameBangla(selectedDate)} বারে ডাক্তারের চেম্বার বন্ধ থাকে।`);

			const now = new Date();
			const apptDate = new Date(selectedDate);
			const dToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
			const dAppt = new Date(apptDate.getFullYear(), apptDate.getMonth(), apptDate.getDate());
			const diffInDays = Math.round((dAppt - dToday) / (1000 * 60 * 60 * 24));
			const toBanglaNum = (num) => num.toString().replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[d]);

			if (diffInDays < 0) throw new Error('অতীতের তারিখ সম্ভব নয়।');

			if (schedule.booking_window_type === 'anytime') {
				if (diffInDays > schedule.booking_day_offset)
					throw new Error(
						`আপনি সর্বোচ্চ ${toBanglaNum(schedule.booking_day_offset)} দিন আগে সিরিয়াল নিতে পারবেন।`
					);
			} else {
				const releaseDate = new Date(dAppt);
				releaseDate.setDate(dAppt.getDate() - schedule.booking_day_offset);
				const [h, m] = schedule.booking_start_time.split(':');
				releaseDate.setHours(parseInt(h), parseInt(m), 0, 0);
				if (now < releaseDate)
					throw new Error(
						`${formatDateBangla(selectedDate)} (${getDayNameBangla(selectedDate)}) এর সিরিয়াল ` +
							`${formatDateBangla(releaseDate)} (${getDayNameBangla(releaseDate)}) ` +
							`${format12h(schedule.booking_start_time)} থেকে শুরু হবে।`
					);
			}

			// --- STEP 4: GLOBAL SETTINGS & CATEGORY SLOTS ---
			const [{ data: globalSlots }, { data: bookedAppts }] = await Promise.all([
				supabase.from('global_settings').select('*').single(),
				supabase
					.from('appointments')
					.select('serial_no')
					.eq('appointment_date', selectedDate)
					.eq('patient_type', patientType)
					.neq('status', 'cancelled')
			]);

			if (!globalSlots) throw new Error('স্লট কনফিগারেশন পাওয়া যায়নি।');

			let targetCSV = '';
			if (patientType === 'new') targetCSV = globalSlots.new_slots_csv;
			else if (patientType === 'old') targetCSV = globalSlots.old_slots_csv;
			else if (patientType === 'report') targetCSV = globalSlots.report_slots_csv;

			const allowedNumbers = parseRange(targetCSV);
			const takenSerials = bookedAppts ? bookedAppts.map((a) => a.serial_no) : [];

			const finalSerialNum = allowedNumbers.find((num) => !takenSerials.includes(num));

			if (!finalSerialNum) {
				const categoryLabel = patientTypes.find((t) => t.id === patientType).label;
				throw new Error(
					`দুঃখিত, এই তারিখে ${categoryLabel} ক্যাটাগরির সকল অনলাইন স্লট বুক হয়ে গেছে।`
				);
			}

			// --- STEP 5: FINALIZE PREVIEW ---
			const currentType = patientTypes.find((t) => t.id === patientType);
			previewSerial = `${currentType.prefix}-${finalSerialNum}`;

			step = 2;
			window.scrollTo({ top: 0, behavior: 'smooth' });
		} catch (err) {
			console.error('Booking Validation Failed:', err);
			statusMsg = err.message;
			if (window.turnstile) window.turnstile.reset();
		} finally {
			loading = false;
		}
	}
	async function confirmBooking() {
		if (!isVerified) return;
		loading = true;
		statusMsg = '';
		try {
			const { data, error } = await supabase.rpc('book_appointment', {
				p_date: selectedDate,
				p_name: name,
				p_phone: phone,
				p_age: parseInt(age),
				p_type: patientType
			});
			if (error) throw new Error('দুঃখিত, আপনার দেখা স্লটটি বুক হয়ে গেছে।');
			const prefix = patientTypes.find((t) => t.id === patientType).prefix;
			previewSerial = `${prefix}-${data}`;
			step = 3;
		} catch (err) {
			statusMsg = err.message;
			setTimeout(() => {
				step = 1;
				previewSerial = null;
				statusMsg = '';
			}, 2500);
		} finally {
			loading = false;
		}
	}

	// --- THE DOWNLOAD ENGINE ---
	async function downloadReceipt() {
		downloading = true;
		try {
			await document.fonts.ready;

			const canvas = document.createElement('canvas');
			const ctx = canvas.getContext('2d');
			const scale = 3;
			const w = 400;
			const h = 620;
			canvas.width = w * scale;
			canvas.height = h * scale;
			ctx.scale(scale, scale);

			// Background
			ctx.fillStyle = '#ffffff';
			ctx.beginPath();
			ctx.roundRect ? ctx.roundRect(0, 0, w, h, 24) : ctx.rect(0, 0, w, h);
			ctx.fill();

			// Header
			ctx.fillStyle = '#0f172a';
			ctx.beginPath();
			ctx.roundRect ? ctx.roundRect(0, 0, w, 140, [24, 24, 0, 0]) : ctx.fillRect(0, 0, w, 140);
			ctx.fill();

			ctx.textAlign = 'center';
			ctx.fillStyle = '#ffffff';
			ctx.font = "bold 22px 'Hind Siliguri'";
			
			// Wrapping Doctor Name
			const maxWidth = w - 60;
			const words = doctor.name.split(' ');
			let line = '', lines = [], y = 50;
			for (let n = 0; n < words.length; n++) {
				let test = line + words[n] + ' ';
				if (ctx.measureText(test).width > maxWidth && n > 0) {
					lines.push(line); line = words[n] + ' ';
				} else { line = test; }
			}
			lines.push(line);
			lines.forEach((l, i) => ctx.fillText(l.trim(), w / 2, y + (i * 30)));

			// Speciality
			ctx.fillStyle = '#94a3b8';
			ctx.font = "500 13px 'Hind Siliguri'";
			ctx.fillText(doctor.speciality.toUpperCase(), w / 2, y + (lines.length * 30) + 5);

			// Serial
			ctx.fillStyle = '#64748b';
			ctx.font = "800 11px 'Hind Siliguri'";
			ctx.fillText('বুকিং সিরিয়াল নম্বর', w / 2, 190);
			ctx.fillStyle = '#2563eb';
			ctx.font = "900 96px 'Hind Siliguri'";
			ctx.fillText(previewSerial, w / 2, 275);

			// Badge
			const badge = patientTypes.find(t => t.id === patientType).label + ' রোগী';
			ctx.fillStyle = '#eff6ff';
			ctx.beginPath();
			ctx.roundRect(w/2 - 60, 310, 120, 30, 15);
			ctx.fill();
			ctx.fillStyle = '#2563eb';
			ctx.font = "bold 13px 'Hind Siliguri'";
			ctx.fillText(badge, w/2, 330);

			// Info Grid
			ctx.strokeStyle = '#e2e8f0';
			ctx.setLineDash([5, 5]);
			ctx.beginPath(); ctx.moveTo(40, 370); ctx.lineTo(w-40, 370); ctx.stroke();
			ctx.setLineDash([]);

			// Row 1: Name & Age
			ctx.textAlign = 'left'; ctx.fillStyle = '#94a3b8'; ctx.font = "700 10px 'Hind Siliguri'";
			ctx.fillText('রোগীর নাম', 40, 400);
			ctx.fillStyle = '#1e293b'; ctx.font = "bold 16px 'Hind Siliguri'";
			ctx.fillText(name, 40, 425);
			
			ctx.textAlign = 'right'; ctx.fillStyle = '#94a3b8'; ctx.font = "700 10px 'Hind Siliguri'";
			ctx.fillText('বয়স', w-40, 400);
			ctx.fillStyle = '#1e293b'; ctx.font = "bold 16px 'Hind Siliguri'";
			ctx.fillText(`${age} বছর`, w-40, 425);

			// Row 2: Date & Time
			ctx.textAlign = 'left'; ctx.fillStyle = '#94a3b8'; ctx.font = "700 10px 'Hind Siliguri'";
			ctx.fillText('বুকিং তারিখ', 40, 465);
			ctx.fillStyle = '#1e293b'; ctx.font = "600 15px 'Hind Siliguri'";
			ctx.fillText(formatDateBangla(selectedDate), 40, 490);

			ctx.textAlign = 'right'; ctx.fillStyle = '#94a3b8'; ctx.font = "700 10px 'Hind Siliguri'";
			ctx.fillText('রিপোর্টিং সময়', w-40, 465);
			ctx.fillStyle = '#2563eb'; ctx.font = "800 15px 'Hind Siliguri'";
			ctx.fillText(findTimeForSerial(previewSerial), w-40, 490);

			// Chamber
			ctx.fillStyle = '#f8fafc'; ctx.beginPath(); ctx.roundRect(40, 520, w-80, 60, 12); ctx.fill();
			ctx.textAlign = 'center'; ctx.fillStyle = '#64748b'; ctx.font = "800 9px 'Hind Siliguri'";
			ctx.fillText('স্থান / চেম্বার', w / 2, 540);
			ctx.fillStyle = '#334155'; ctx.font = "bold 13px 'Hind Siliguri'";
			ctx.fillText(doctor.practicing_center, w / 2, 565);

			// Footer
			ctx.fillStyle = '#94a3b8'; ctx.font = "500 9px 'Hind Siliguri'";
			ctx.fillText(`ইস্যু করা হয়েছে: ${new Date().toLocaleDateString('bn-BD')} | ${new Date().toLocaleTimeString('bn-BD')}`, w/2, 605);

			const link = document.createElement('a');
			link.download = `Serial_${previewSerial}.png`;
			link.href = canvas.toDataURL('image/png', 1.0);
			link.click();
		} catch (e) { console.error(e); }
		downloading = false;
	}
</script>

<div class="card">
	{#if step < 3}
		<div class="flex items-start gap-4 mb-8 border-b border-slate-100 pb-6">
			<div
				class="h-20 w-20 rounded-2xl bg-blue-50 overflow-hidden flex-shrink-0 border-2 border-white shadow-sm"
			>
				{#if doctor.photo_url}<img
						src={doctor.photo_url}
						alt={doctor.name}
						class="h-full w-full object-cover"
					/>{:else}<div
						class="h-full w-full flex items-center justify-center text-blue-300 font-bold"
					>
						DR
					</div>{/if}
			</div>
			<div class="space-y-1">
				<h1 class="text-xl font-bold text-slate-900 leading-tight">{doctor.name}</h1>
				<p class="text-[11px] font-bold text-blue-600 uppercase tracking-wide">
					{doctor.speciality}
				</p>
				<p class="text-[10px] text-slate-400 font-medium leading-relaxed">
					{doctor.degrees} <br />
					{doctor.designation}
				</p>
			</div>
		</div>
	{/if}

	{#if step === 1}
		<div class="space-y-6">
			<div
				class="text-center bg-slate-50 py-8 rounded-[2.5rem] border border-slate-100 shadow-inner"
			>
				<p class="text-blue-600 font-bold text-lg mb-1">{getDayNameBangla(selectedDate)}</p>
				<h1 class="text-4xl font-black text-slate-800 tracking-tight">
					{formatDateBangla(selectedDate)}
				</h1>
				<div class="mt-4 inline-block relative">
					<input
						type="date"
						bind:value={selectedDate}
						bind:this={dateInput}
						on:change={handleDateChange}
						class="absolute inset-0 w-0 h-0 opacity-0"
					/>
					<button
						on:click={openCalendar}
						class="bg-white px-5 py-2 rounded-full text-xs font-bold text-slate-500 shadow-sm border border-slate-200 active:bg-slate-50"
						>তারিখ পরিবর্তন করুন</button
					>
				</div>
			</div>

			<div class="space-y-4">
				<div class="relative">
					<input
						value={name}
						on:input={handleNameInput}
						on:blur={() => setTimeout(() => (showSuggestions = false), 200)}
						placeholder="রোগীর নাম"
						class="w-full p-4 bg-slate-50 rounded-2xl border-2 border-transparent focus:border-blue-500 outline-none font-medium"
					/>
					{#if showSuggestions && suggestions.length > 0}
						<div
							class="absolute z-50 w-full mt-2 bg-white border border-slate-100 rounded-2xl shadow-xl overflow-hidden"
						>
							{#each suggestions as word}
								<button
									on:click={() => selectSuggestion(word)}
									class="w-full text-left px-4 py-3 hover:bg-blue-50 text-slate-700 font-medium border-b border-slate-50 last:border-none"
									>{word}</button
								>
							{/each}
						</div>
					{/if}
				</div>

				<input
					bind:value={phone}
					type="tel"
					placeholder="মোবাইল নম্বর"
					class="w-full p-4 bg-slate-50 rounded-2xl border-2 border-transparent focus:border-blue-500 outline-none font-medium"
				/>
				<input
					bind:value={age}
					type="number"
					placeholder="বয়স"
					class="w-full p-4 bg-slate-50 rounded-2xl border-2 border-transparent focus:border-blue-500 outline-none font-medium"
				/>

				<div class="space-y-2">
					<p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-2">
						রোগীর ধরন নির্বাচন করুন
					</p>
					<div class="grid grid-cols-3 gap-2 bg-slate-100 p-1.5 rounded-2xl">
						{#each patientTypes as type}
							<button
								on:click={() => (patientType = type.id)}
								class="py-3 rounded-xl text-xs font-bold transition-all {patientType === type.id
									? 'bg-white shadow text-blue-600'
									: 'text-slate-500'}">{type.label}</button
							>
						{/each}
					</div>
				</div>

				<div id="turnstile-widget" class="flex justify-center py-2"></div>
			</div>

			<button
				on:click={previewBooking}
				disabled={loading}
				class="w-full bg-blue-600 text-white py-5 rounded-[2rem] font-bold text-lg shadow-lg active:scale-95 disabled:bg-slate-200"
			>
				{loading ? 'যাচাই হচ্ছে...' : 'সিরিয়াল চেক করুন'}
			</button>
		</div>
	{:else if step === 2}
		<div class="text-center space-y-8">
			<div class="bg-slate-900 py-10 rounded-[3rem] text-white">
				<p class="text-xs opacity-50 uppercase tracking-widest mb-2">
					{patientTypes.find((t) => t.id === patientType).label} সিরিয়াল
				</p>
				<h1 class="text-8xl font-bold tracking-tighter">{previewSerial}</h1>
			</div>
			<div class="bg-blue-600 p-6 rounded-[2rem] text-white">
				<p class="text-xs opacity-80 uppercase mb-1">রিপোর্টিং সময় (আনুমানিক)</p>
				<p class="text-2xl font-bold">{findTimeForSerial(previewSerial)}</p>
			</div>
			<p class="font-bold text-slate-700">
				{getDayNameBangla(selectedDate)}, {formatDateBangla(selectedDate)}
			</p>
			<label
				class="flex items-center justify-between p-5 bg-blue-50 rounded-2xl border-2 border-blue-100 cursor-pointer"
			>
				<span class="font-bold text-blue-700 text-sm">আমি সকল তথ্য নিশ্চিত করছি</span>
				<input type="checkbox" bind:checked={isVerified} class="w-6 h-6 accent-blue-600" />
			</label>
			<div class="flex flex-col gap-3">
				<button
					on:click={confirmBooking}
					disabled={!isVerified || loading}
					class="w-full bg-blue-600 text-white py-5 rounded-[2rem] font-bold shadow-xl"
					>বুকিং নিশ্চিত করুন</button
				>
				<button on:click={() => (step = 1)} class="text-slate-400 font-bold text-sm"
					>তথ্যাদি পরিবর্তন করুন</button
				>
			</div>
		</div>
	{:else if step === 3}
		<div class="text-center py-6 space-y-6">
			<div
				class="w-20 h-20 bg-green-500 text-white rounded-full flex items-center justify-center text-4xl mx-auto shadow-xl"
			>
				✓
			</div>
			<h2 class="text-3xl font-bold text-slate-800">বুকিং সফল হয়েছে!</h2>
			<div class="bg-slate-50 p-8 rounded-[3rem] border border-slate-200">
				<p class="text-slate-400 uppercase text-xs mb-2">আপনার সিরিয়াল নম্বর</p>
				<p class="text-7xl font-bold text-blue-600 tracking-tighter">{previewSerial}</p>
				<hr class="my-6 border-slate-200" />
				<div class="space-y-2">
					<p class="text-sm font-bold text-slate-700">
						রিপোর্টিং: {findTimeForSerial(previewSerial)}
					</p>
					<p class="text-xs text-slate-500">{formatDateBangla(selectedDate)}</p>
				</div>
			</div>
			<div class="flex flex-col gap-3">
				<button
					on:click={downloadReceipt}
					disabled={downloading}
					class="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold"
					>রিসিট ডাউনলোড করুন</button
				>
				<button
					on:click={() => location.reload()}
					class="bg-slate-100 text-slate-600 px-8 py-3 rounded-full font-bold text-sm"
					>নতুন বুকিং</button
				>
			</div>
		</div>
	{/if}

	{#if statusMsg}<div
			class="mt-6 p-4 bg-red-50 text-red-600 text-sm font-bold rounded-2xl border border-red-100 text-center animate-pulse"
		>
			⚠️ {statusMsg}
		</div>{/if}
</div>


<style>
	@import url('https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700;900&display=swap');
	:global(body) {
		font-family: 'Hind Siliguri', sans-serif;
		background-color: #f8fafc;
	}
	.card {
		max-width: 450px;
		margin: 20px auto;
		padding: 30px;
		background: white;
		border-radius: 40px;
		box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.05);
	}
</style>
