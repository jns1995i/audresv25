window.addEventListener('load', () => {
  document.querySelectorAll('.primaryProfile').forEach(img => {
    img.onerror = () => {
      img.onerror = null;
      img.src = '/images/profile.png';
    };
  });
});