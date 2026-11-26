declare module 'express/lib/application' {
  const application: Record<string, unknown>;
  export default application;
}

declare module 'express/lib/request' {
  const request: Record<string, unknown>;
  export default request;
}

declare module 'express/lib/response' {
  const response: Record<string, unknown>;
  export default response;
}
