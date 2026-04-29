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

import { Navigate, Route, Routes } from 'react-router-dom';

import { PlatformOpsPage } from './PlatformOpsPage';

/**
 * Standalone mount for the Platform Operations route.
 * For now, no permission check - can add later with platformOpsViewPermission.
 */
export const PlatformOpsRoutesPage = () => {
  return (
    <Routes>
      <Route index element={<Navigate to="certificates" replace />} />
      <Route path="certificates" element={<PlatformOpsPage />} />
      <Route path="tasks" element={<PlatformOpsPage />} />
      <Route path="history" element={<PlatformOpsPage />} />
      <Route path="*" element={<Navigate to="certificates" replace />} />
    </Routes>
  );
};
