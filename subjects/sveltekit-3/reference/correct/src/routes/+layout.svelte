<script>
	import { page } from '$app/state';
	let { children } = $props();
</script>

<nav>
	<a href="/">Home</a>
	<a href="/about">About</a>
</nav>
<p>Current path: {page.url.pathname}</p>
{@render children()}
