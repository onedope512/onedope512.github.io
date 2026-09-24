// A short boarding gate between the portfolio and the résumé.
// Ordinary links still work when JavaScript or animation is unavailable.
(function(){
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const page = /(?:^|\/)resume\.html$/.test(location.pathname) ? 'resume' : 'portfolio';
  const returnKey = 'resumeReturnPoint';
  const restoreKey = 'resumeReturnPending';
  const incoming = (() => {
    try{
      const value = sessionStorage.getItem('boardingTransition');
      sessionStorage.removeItem('boardingTransition');
      return value === '1';
    }catch(e){ return false; }
  })();

  function getReturnPoint(){
    try{
      const point = JSON.parse(sessionStorage.getItem(returnKey));
      const url = new URL(point.url);
      if(url.origin !== location.origin || !/^\/(?:index\.html)?$/.test(url.pathname)) return null;
      if(!Number.isFinite(point.y) || point.y < 0) return null;
      return { url: url.href, y: point.y };
    }catch(e){ return null; }
  }

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
    const curtain = reduced ? null : makeCurtain();
    if(incoming && curtain){
      curtain.classList.add('is-arriving');
      // Commit the covered frame before sliding the curtain away.
      void curtain.offsetHeight;
      requestAnimationFrame(() => requestAnimationFrame(() => curtain.classList.remove('is-arriving')));
    }

    document.querySelectorAll('a[data-page-transition]').forEach(link => {
      link.addEventListener('click', event => {
        if(event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        let destination = link.href;
        const returning = page === 'resume' && link.hasAttribute('data-return-to-portfolio');
        if(page === 'portfolio' && new URL(destination).pathname.endsWith('/resume.html')){
          try{ sessionStorage.setItem(returnKey, JSON.stringify({ url: location.href, y: window.scrollY })); }catch(e){}
        }
        if(returning){
          const point = getReturnPoint();
          if(point){
            destination = point.url;
            try{ sessionStorage.setItem(restoreKey, '1'); }catch(e){}
          }
        }
        if(curtain){
          curtain.classList.add('is-departing');
          try{ sessionStorage.setItem('boardingTransition', '1'); }catch(e){}
        }
        window.setTimeout(() => {
          if(returning) location.replace(destination);
          else location.href = destination;
        }, curtain ? 480 : 0);
      });
    });

    window.addEventListener('pageshow', event => {
      if(event.persisted && curtain) curtain.classList.remove('is-departing', 'is-arriving');
    });

    if(page === 'resume'){
      // Also cover the browser's Back button, which can restore the portfolio from cache.
      window.addEventListener('pagehide', () => {
        if(!getReturnPoint()) return;
        try{ sessionStorage.setItem(restoreKey, '1'); }catch(e){}
      });
    } else {
      window.addEventListener('pageshow', () => {
        let shouldRestore = false;
        try{
          shouldRestore = sessionStorage.getItem(restoreKey) === '1';
          sessionStorage.removeItem(restoreKey);
        }catch(e){}
        const point = shouldRestore ? getReturnPoint() : null;
        if(!point) return;
        const root = document.documentElement;
        const previous = root.style.scrollBehavior;
        root.style.scrollBehavior = 'auto';
        const restore = () => window.scrollTo(0, point.y);
        restore();
        requestAnimationFrame(restore);
        // Hash targeting and late layout can otherwise shift the viewport after pageshow.
        window.setTimeout(() => {
          restore();
          root.style.scrollBehavior = previous;
        }, 150);
      });
    }
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup, { once: true });
  else setup();
})();
