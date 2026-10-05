declare global {
  namespace Express {
    interface Request {
      user?: { id: string };
      membership?: { organizationId : string, role : Role}
    }
  }
}

export {};