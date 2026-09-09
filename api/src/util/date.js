/**
 * Calendar date as YYYY-MM-DD in the SERVER'S LOCAL timezone.
 *
 * Do not use `toISOString().slice(0,10)` here. The seeder writes dates at local
 * midnight; `toISOString` converts to UTC, so anywhere east of Greenwich - including
 * IST, where this is demoed - local midnight is the *previous* day in UTC and every
 * emitted date lands one day early. That bug is invisible inside a UTC container and
 * visible on the laptop, which is the worst possible combination.
 */
export const isoDate = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
