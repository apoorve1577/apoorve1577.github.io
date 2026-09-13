(() => {
  // Tabs, on the experience page.
  const tabs = [...document.querySelectorAll('.tab')];
  tabs.forEach(t => t.addEventListener('click', () => {
    tabs.forEach(x => {
      const on = x === t;
      x.setAttribute('aria-selected', on);
      document.getElementById(x.dataset.pane).hidden = !on;
    });
  }));

  // Reveal on scroll, everywhere.
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); }
  }), {rootMargin:'-40px'});
  document.querySelectorAll('.rv').forEach(n => io.observe(n));
})();
