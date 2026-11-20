/**
 * WAI-ARIA vocabulary for the accessibility rules: WAI-ARIA 1.2 plus the ARIA 1.3 additions browsers
 * already support, the Digital Publishing (DPUB-ARIA 1.1) roles and the Graphics (Graphics-ARIA) roles.
 */

const words = (list: string): ReadonlySet<string> => new Set(list.trim().split(/\s+/));

/** Every `aria-*` state and property. */
export const ARIA_ATTRIBUTES = words(`
  aria-activedescendant aria-atomic aria-autocomplete aria-braillelabel aria-brailleroledescription aria-busy
  aria-checked aria-colcount aria-colindex aria-colindextext aria-colspan aria-controls aria-current
  aria-describedby aria-description aria-details aria-disabled aria-dropeffect aria-errormessage aria-expanded
  aria-flowto aria-grabbed aria-haspopup aria-hidden aria-invalid aria-keyshortcuts aria-label aria-labelledby
  aria-level aria-live aria-modal aria-multiline aria-multiselectable aria-orientation aria-owns aria-placeholder
  aria-posinset aria-pressed aria-readonly aria-relevant aria-required aria-roledescription aria-rowcount
  aria-rowindex aria-rowindextext aria-rowspan aria-selected aria-setsize aria-sort aria-valuemax aria-valuemin
  aria-valuenow aria-valuetext
`);

/** Concrete roles an author may use. */
export const ARIA_ROLES = words(`
  alert alertdialog application article banner blockquote button caption cell checkbox code columnheader combobox
  comment complementary contentinfo definition deletion dialog directory document emphasis feed figure form generic
  grid gridcell group heading image img insertion link list listbox listitem log main mark marquee math menu menubar
  menuitem menuitemcheckbox menuitemradio meter navigation none note option paragraph presentation progressbar radio
  radiogroup region row rowgroup rowheader scrollbar search searchbox sectionfooter sectionheader separator slider
  spinbutton status strong subscript suggestion superscript switch tab table tablist tabpanel term textbox time timer
  toolbar tooltip tree treegrid treeitem
  doc-abstract doc-acknowledgments doc-afterword doc-appendix doc-backlink doc-biblioentry doc-bibliography
  doc-biblioref doc-chapter doc-colophon doc-conclusion doc-cover doc-credit doc-credits doc-dedication doc-endnote
  doc-endnotes doc-epigraph doc-epilogue doc-errata doc-example doc-footnote doc-foreword doc-glossary doc-glossref
  doc-index doc-introduction doc-noteref doc-notice doc-pagebreak doc-pagefooter doc-pageheader doc-pagelist doc-part
  doc-preface doc-prologue doc-pullquote doc-qna doc-subtitle doc-tip doc-toc
  graphics-document graphics-object graphics-symbol
`);

/** Abstract roles: the ontology's base classes, never valid in content. */
export const ABSTRACT_ARIA_ROLES = words(`
  command composite input landmark range roletype section sectionhead select structure widget window
`);
