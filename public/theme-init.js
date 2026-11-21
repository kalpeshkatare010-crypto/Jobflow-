// Apply the saved theme before the page draws, so dark mode never flashes white.
// Kept as a file (not inline) so the Content-Security-Policy can forbid inline scripts.
(function () {
  try {
    var saved = JSON.parse(localStorage.getItem('jobflow:theme') || '"system"');
    var dark = saved === 'dark' || (saved === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  } catch (e) {}
})();
