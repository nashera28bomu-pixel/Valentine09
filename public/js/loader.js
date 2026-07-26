// Kickoff loader: shows for a minimum time so the animation always completes
// at least one full "kickoff" cycle, even on fast connections.
(function () {
  const MIN_DISPLAY_MS = 1800;
  const start = Date.now();

  function reveal() {
    const elapsed = Date.now() - start;
    const wait = Math.max(0, MIN_DISPLAY_MS - elapsed);
    setTimeout(() => {
      const loader = document.getElementById('kickoff-loader');
      const app = document.getElementById('app');
      loader.classList.add('fade-out');
      app.classList.remove('hidden');
      setTimeout(() => loader.remove(), 650);
    }, wait);
  }

  if (document.readyState === 'complete') {
    reveal();
  } else {
    window.addEventListener('load', reveal);
  }
})();
