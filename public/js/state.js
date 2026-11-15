// State shared across modules. Modules read and write these fields directly (ES module exports can't be reassigned).
export const state = {
  years: [],        // [{ year, updatedAt }] from the server
  doc: null,        // the open year
  tab: 0,           // 0..11 or 'summary'
  prefs: null,      // per-browser preferences (see prefs.js)
  donutDrill: false, // month donut shows the savings rows instead of the categories
  pieDrill: false,   // summary pie shows the savings rows
  hideTaxes: false,  // month donut leaves taxes out
};

export const onSummary = () => state.tab === 'summary';
export const curMonth = () => state.doc.months[state.tab];
