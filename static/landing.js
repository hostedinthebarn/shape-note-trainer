// Returning singers go straight to the app. A first visit, or any visit with ?about, stays here.
// The page is complete without this file; it only saves people a tap.
const params = new URLSearchParams(location.search);
const installed = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
let returning = false;
try { returning = localStorage.getItem("snt.settings.v1") !== null; } catch { /* storage blocked: stay on the landing page */ }
if (!params.has("about") && (installed || returning)) location.replace("/practice/");
