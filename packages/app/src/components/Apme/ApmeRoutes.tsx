/*
 * Copyright Red Hat
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Navigate, Route } from 'react-router-dom';

/** Legacy /apme URLs redirect to Git Repositories catalog (B-Nav). */
export const ApmeRoutes = () => (
  <>
    <Route
      path="/apme"
      element={<Navigate to="/self-service/repositories/catalog" replace />}
    />
    <Route
      path="/apme/project/:projectId"
      element={<Navigate to="/self-service/repositories/catalog" replace />}
    />
  </>
);
