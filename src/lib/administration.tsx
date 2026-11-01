import {createContext, useContext} from 'react';
import type {ReactNode} from 'react';
import {useAuth} from './auth';
import type {AdministrationAccess} from './session-validation';
const Context = createContext<AdministrationAccess>({sections: [], status: 'loading'});
export function AdministrationProvider({children}: {children: ReactNode}) {
  const {administration} = useAuth();
  return <Context value={administration ?? {sections: [], status: 'ready'}}>{children}</Context>;
}
export const useAdministration = () => useContext(Context);
