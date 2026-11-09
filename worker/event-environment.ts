import type {EmailEnvironment} from './auth/email';
import {hostedDev,loopback} from './auth/environment';
import {hostedProd} from './auth/production';
// Same immutable build/origin contract as authentication, plus explicit activation.
export function eventEnvironmentEnabled(request:Request,env:EmailEnvironment):boolean{
 return loopback(new URL(request.url))||hostedDev(request,env)||env.EVENTS_MODE==='enabled'&&hostedProd(request,env);
}
