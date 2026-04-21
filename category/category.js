(function () {
  const PAGE_SIZE = 12;
  const cat = document.body.dataset.cat;
  const grid = document.getElementById('catGrid');
  const pag = document.getElementById('catPagination');
  if (!grid || !pag || !cat) return;

  const url = new URL(window.location.href);
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));

  fetch('../articles.json', { cache: 'no-cache' })
    .then(r => r.json())
    .then(data => {
      const list = (data.articles || [])
        .filter(a => cat === 'all' ? true : a.cat === cat)
        .sort((a, b) => (b.dateIso || '').localeCompare(a.dateIso || ''));

      if (!list.length) {
        grid.innerHTML = '<div class="category__empty">Пока нет статей в этой категории. Скоро появятся.</div>';
        return;
      }

      const pages = Math.ceil(list.length / PAGE_SIZE);
      const p = Math.min(page, pages);
      const slice = list.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);

      grid.innerHTML = slice.map(a => `
        <a class="category-card" href="../${a.url}" style="background-image:linear-gradient(180deg, rgba(10,13,18,0.1) 0%, rgba(10,13,18,0.88) 100%), url('../${a.img}')">
          <span class="category-card__tag">${a.catLabel}</span>
          <h2 class="category-card__title">${a.title}</h2>
          <div class="category-card__meta">${a.date} - ${a.read}</div>
        </a>
      `).join('');

      if (pages > 1) {
        const items = [];
        for (let i = 1; i <= pages; i++) {
          items.push(`<a class="category__page${i === p ? ' is-active' : ''}" href="?page=${i}">${i}</a>`);
        }
        pag.innerHTML = items.join('');
      }
    })
    .catch(() => {
      grid.innerHTML = '<div class="category__empty">Не удалось загрузить статьи.</div>';
    });
})();
