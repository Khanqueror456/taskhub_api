import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { orgParams } from "../organizations/organizations.schema.js";
import * as c from './projects.controller.js'
import {
    createProjectSchema,
    listProjectsQuery,
    projectParams,
    updateProjectSchema
} from './projects.schema.js'
import { createProject } from "./projects.service.js";


// mergeParams lets this router see : orgId from the mount path in app.ts
export const projectRouter = Router({ mergeParams : true });

projectRouter.use(authenticate);

projectRouter.get(
    '/',
    validate({ params : orgParams, query : listProjectsQuery }),
    authorize('project:read'),
    c.listProjects,
);

projectRouter.post(
    '/',
    validate({ params : orgParams, body : createProjectSchema }),
    authorize('project:write'),
    c.createProject
);

projectRouter.get('/:projectid', validate({ params : projectParams }), authorize('project:read'), c.getProject);

projectRouter.patch(
    '/:projectId',
    validate({ params : orgParams, body : updateProjectSchema }),
    authorize('project:write'),
    c.updateProject
)

projectRouter.delete(
    '/:projectId',
    validate({ params : projectParams }),
    authorize('project:write'),
    c.deleteProject
)