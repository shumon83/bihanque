<script>
	import '../app.css';
	// This layout wraps around all your pages (+page.svelte files)
</script>

<nav class="bg-slate-900 text-white p-4 shadow-lg">
	<div class="max-w-6xl mx-auto flex justify-between items-center">
		<div class="font-bold text-xl tracking-tight">
			<span class="text-blue-400">Medi</span>Queue
		</div>
		<div class="space-x-6 text-sm font-medium">
			<a href="/patient" class="hover:text-blue-400 transition">Patient</a>
			<a href="/doctor" class="hover:text-blue-400 transition">Doctor</a>
			<a href="/assistant" class="hover:text-blue-400 transition">Assistant</a>
		</div>
	</div>
</nav>

<main class="min-h-screen bg-gray-50">
	<slot />
</main>

<footer class="p-8 text-center text-gray-400 text-xs">
	&copy; 2026 MediQueue Systems • Serial-Based Scheduling
</footer>
