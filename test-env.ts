import { AngularNodeAppEngine } from '@angular/ssr/node';
process.env['NG_TRUST_PROXY_HEADERS'] = '1';
process.env['NG_ALLOWED_HOSTS'] = 'all';
const app = new AngularNodeAppEngine();
