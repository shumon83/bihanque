export const checkAvailability = (schedule, existingAppointments, patientAge) => {
	const now = new Date();
	const today = now.getDay();
	const currentTime = now.toTimeString().slice(0, 5);

	// 1. Check Appointment Opening Window
	if (schedule.booking_window_type === 'specific_day') {
		const openDay = (schedule.day_of_week - schedule.booking_day_offset + 7) % 7;
		if (today !== openDay)
			return { allowed: false, msg: `Appointments open on ${getDayName(openDay)}` };

		if (currentTime < schedule.booking_start_time || currentTime > schedule.booking_end_time) {
			return {
				allowed: false,
				msg: `Booking window is ${schedule.booking_start_time} to ${schedule.booking_end_time}`
			};
		}
	}

	// 2. Find Next Serial
	const takenSerials = existingAppointments.map((a) => a.serial_no);
	let nextSerial = 1;

	// Logic for Senior Priority (simplified)
	if (patientAge >= 60) {
		// Doctors often reserve low or specific serials for seniors
		// For now, we just find the first empty slot
		while (takenSerials.includes(nextSerial)) nextSerial++;
	} else {
		while (takenSerials.includes(nextSerial)) nextSerial++;
	}

	if (nextSerial > schedule.max_patients)
		return { allowed: false, msg: 'Doctor is fully booked for this day.' };

	return { allowed: true, serial: nextSerial };
};

function getDayName(dayIndex) {
	return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayIndex];
}
