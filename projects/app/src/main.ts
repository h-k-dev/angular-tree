import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// RTL switch for the demo + the e2e matrix (`?dir=rtl`): CDK Directionality
// samples the document attribute once at service construction, so it must be
// set before bootstrap — an init script or post-load flip arrives too late.
const dir = new URLSearchParams(location.search).get('dir');
if (dir === 'rtl' || dir === 'ltr') document.documentElement.dir = dir;

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
