// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
// Sets the stored theme before hydration to avoid a flash of the wrong palette.
try {
  var t = localStorage.getItem('xss_theme');
  if (t === 'light') document.documentElement.classList.add('light');
  document.documentElement.dataset.theme = t === 'light' ? 'light' : 'dark';
} catch {
  // Storage may be unavailable (private mode / blocked cookies): keep the dark default.
  document.documentElement.dataset.theme = 'dark';
}
