/*
 * Copyright 2024 The Ansible plugin Authors
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
/* stdlib */
import * as path from "path";

/**
 * A helper method to get interpreter path related settings to
 * while running the command.
 * @param settings - The extension setting.
 * @param runExecutable - The name of the executable to run.
 * @param runArgs - The arguments to the executable.
 * @returns The complete command to be executed.
 */
export function withInterpreter(
  runExecutable: string,
  cmdArgs: string,
  interpreterPath?: string,
  activationScript?: string,
): [string, NodeJS.ProcessEnv | undefined] {
  let command = `${runExecutable} ${cmdArgs}`; // base case

  const newEnv = Object.assign({}, process.env, {
    ANSIBLE_FORCE_COLOR: "0",
    PYTHONBREAKPOINT: "0",
  });

  if (activationScript) {
    command = `bash -c 'source ${activationScript} && ${runExecutable} ${cmdArgs}'`;
    return [command, undefined];
  }

  if (interpreterPath && interpreterPath !== "") {
    const virtualEnv = path.resolve(interpreterPath, "../..");

    const pathEntry = path.join(virtualEnv, "bin");
    if (path.isAbsolute(runExecutable)) {
      // if the user provided a path to the executable, we directly execute the app.
      command = `${runExecutable} ${cmdArgs}`;
    }
    // emulating virtual environment activation script
    newEnv.VIRTUAL_ENV = virtualEnv;
    newEnv.PATH = `${pathEntry}:${process.env.PATH}`;
    delete newEnv.PYTHONHOME;
  }
  return [command, newEnv];
}
