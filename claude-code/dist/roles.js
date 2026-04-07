"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.STRUCTURAL_ROLES = exports.CONTENT_ROLES = exports.INTERACTIVE_ROLES = void 0;
exports.INTERACTIVE_ROLES = new Set([
    "button", "checkbox", "combobox", "link", "listbox", "menuitem",
    "menuitemcheckbox", "menuitemradio", "option", "radio", "searchbox",
    "slider", "spinbutton", "switch", "tab", "textbox", "treeitem",
]);
exports.CONTENT_ROLES = new Set([
    "article", "cell", "columnheader", "gridcell", "heading", "listitem",
    "main", "navigation", "region", "rowheader",
]);
exports.STRUCTURAL_ROLES = new Set([
    "application", "directory", "document", "generic", "grid", "group",
    "list", "menu", "menubar", "none", "paragraph", "presentation",
    "row", "rowgroup", "separator", "table", "tablist", "tabpanel",
    "toolbar", "tree", "treegrid",
]);
