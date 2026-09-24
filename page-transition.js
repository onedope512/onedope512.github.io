// A short boarding gate between the portfolio and the résumé.
// Ordinary links still work when JavaScript or animation is unavailable.
(function(){
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const page = /(?:^|\/)resume\.html$/.test(location.pathname) ? 'resume' : 'portfolio';
  const incoming = (() => {
    try{
      const value = sessionStorage.getItem('boardingTransition');
      sessionStorage.removeItem('boardingTransition');
      return value === '1';
    }catch(e){ return false; }
  })();

  function makeCurtain(){
    const curtain = document.createElement('div');
    curtain.className = 'page-transition';
    curtain.setAttribute('aria-hidden', 'true');
    curtain.innerHTML = '<div class="page-transition-ticket">' +
      '<span class="page-transition-kicker">BOARDING IN PROGRESS · N. ADAPALA</span>' +
      '<span class="page-transition-title">' + (page === 'resume' ? 'Back to the flight plan' : 'Your boarding pass is ready') + '</span>' +
      '<span class="page-transition-route">AUS → THE NEXT WAYPOINT</span>' +
      '</div>';
    document.body.appendChild(curtain);
    return curtain;
  }

  function setup(){
    if(reduced) return;
    const curtain = makeCurtain();
    if(incoming){
      curtain.classList.add('is-arriving');
      // Commit the covered frame before sliding the curtain away.
      void curtain.offsetHeight;
      requestAnimationFrame(() => requestAnimationFrame(() => curtain.classList.remove('is-arriving')));
    }

    document.querySelectorAll('a[data-page-transition]').forEach(link => {
      link.addEventListener('click', event => {
        if(event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        const destination = link.href;
        curtain.classList.add('is-departing');
        try{ sessionStorage.setItem('boardingTransition', '1'); }catch(e){}
        window.setTimeout(() => { location.href = destination; }, 480);
      });
    });

    window.addEventListener('pageshow', event => {
      if(event.persisted) curtain.classList.remove('is-departing', 'is-arriving');
    });
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup, { once: true });
  else setup();
})();
