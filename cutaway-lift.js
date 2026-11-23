(() => {
  const figure = document.querySelector('#cutaway-figure-3d');
  const button = document.querySelector('#cutaway-lift');
  const label = button.querySelector('.cutaway-lift-text');
  const video = document.querySelector('#cutaway-motion');
  const raised = document.querySelector('#cutaway-raised');
  const status = document.querySelector('.cutaway-status');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let run = 0;
  let holdTimer;

  function setState(state, buttonText) {
    figure.dataset.lift = state;
    button.toggleAttribute('data-active', state !== 'seated');
    label.textContent = buttonText;
  }

  function seatCover() {
    run++;
    clearTimeout(holdTimer);
    video.pause();
    if (video.readyState > 0) video.currentTime = 0;
    setState('seated', 'Lift cover');
  }

  async function showRaisedStill(currentRun) {
    try {
      if (!raised.hasAttribute('src')) raised.src = raised.dataset.src;
      await raised.decode();
      if (currentRun !== run) return;
      setState('raised', 'Set down');
      holdTimer = setTimeout(seatCover, 1800);
    } catch {
      if (currentRun !== run) return;
      seatCover();
      status.textContent = 'The lift preview could not load. Select Lift cover to try again.';
    }
  }

  async function liftCover() {
    if (figure.dataset.lift !== 'seated') {
      seatCover();
      return;
    }
    const currentRun = ++run;
    status.textContent = '';
    setState('loading', 'Cancel');
    if (reduceMotion.matches) {
      await showRaisedStill(currentRun);
      return;
    }
    try {
      await video.play();
      if (currentRun === run) setState('playing', 'Set down');
    } catch {
      if (currentRun === run) await showRaisedStill(currentRun);
    }
  }

  video.addEventListener('ended', seatCover);
  video.addEventListener('error', () => {
    if (figure.dataset.lift === 'playing') {
      video.pause();
      showRaisedStill(run);
    }
  });
  button.addEventListener('click', liftCover);
  document.querySelector('#cutaway-2d').addEventListener('change', () => {
    seatCover();
    status.textContent = '';
  });
  reduceMotion.addEventListener('change', seatCover);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) seatCover();
  });
  setState('seated', 'Lift cover');
  button.hidden = false;
})();
