declare module '*.png' {
  const source: string;
  export default source;
}

interface Window {
  google?: any;
  gm_authFailure?: () => void;
  initMfuUserMap?: () => void;
}
