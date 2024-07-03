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

export interface ILearningPath {
    "label": string;
    "url": string;
    minutes?: number;
    hours?: number;
    level?: string;
    type?: string;
    description?: string;
}

export type ILab = ILearningPath;

export const learningPaths: ILearningPath[] = [
    {
        "label": "Introduction to Ansible",
        "url": "https://red.ht/aap-lp-ansible-basics",
        minutes: 30,
        level: "Beginner",
        type: "Learning path",
        description: "Learn more about the fundamental concepts of Ansible, an open source IT automation solution that automates provisioning, configuration management, application deployment, orchestration, and many other IT processes."
    },
    {
        "label": "Getting started with the Ansible VS Code extension",
        "url": "https://red.ht/aap-lp-vscode-essentials",
        hours: 1,
        level: "Beginner",
        type: "Learning path",
        description: "Do a deep-dive into the features of Ansible VS Code extension, the Red Hat recommended way of creating your Ansible projects, which brings syntax-highlighting, auto-completion, linting, and generative AI to your automation creation workflows."
    },
    {
        "label": "YAML Essentials for Ansible",
        "url": "https://red.ht/aap-lp-yaml-essentials",
        minutes: 30,
        level: "Beginner",
        type: "Learning path",
        description: "Learn more about YAML and how Ansible Automation Platform uses it for content. YAML offers a straightforward, human-readable way to write Ansible configurations, tasks, and playbooks."
    },
    {
        "label": "Getting started with Ansible playbooks",
        "url": "https://red.ht/aap-lp-getting-started-playbooks",
        hours: 1,
        level: "Beginner",
        type: "Learning path",
        description: "Learn how to create Ansible playbooks, the blueprints for automation tasks executed across an inventory of nodes. Playbooks tell Ansible which tasks to perform on which devices."
    },
    {
        "label": "Getting started with Content Collections",
        "url": "https://red.ht/aap-lp-getting-started-collections",
        hours: 1,
        level: "Intermediate",
        type: "Learning path",
        description: "Learn more about Ansible Content Collections. Content Collections provide a format for organizing and sharing your Ansible content, such as modules, Playbooks, and documentation."
    }
];

export const labs: ILab[] = [
    {
        "minutes": 30,
        "level": "Beginner",
        "type": "Lab",
        "description": "Install ansible-navigator and get hands-on using it.",
        "label": "Getting started with ansible-navigator",
        "url": "https://red.ht/aap-lab-getting-started-navigator"
    },
    {
        "minutes": 45,
        "level": "Beginner",
        "type": "Lab",
        "description": "Install ansible-builder and create a custom Execution Environment.",
        "label": "Getting started with ansible-builder",
        "url": "https://red.ht/aap-lab-getting-started-builder"
    },
    {
        "hours": 1,
        "level": "Beginner",
        "type": "Lab",
        "description": "Learn the basics of Ansible playbooks and automate basic infrastructure tasks.",
        "label": "Writing your first playbook",
        "url": "https://red.ht/aap-lab-getting-started-playbook"
    },
    {
        "minutes": 30,
        "level": "Beginner",
        "type": "Lab",
        "description": "Learn to sign Ansible Content Collections using a Private Automation Hub and install collections with ansible-galaxy CLI.",
        "label": "Signing Ansible Content Collections with Private Automation Hub",
        "url": "https://red.ht/aap-lab-sign-collections-with-pah",
    }
    // Commented this for now since this lab will not be available in the MVP
    // {
    //     "label": "Writing your first Content Collection",
    //     "url": "https://red.ht/aap-lab-create-collection",
    //     time: "50 minutes",
    //     level: "Beginner",
    //     type: "Lab",
    //     description: "Learn more about Ansible Content Collections and get hands-on experience by creating a Collection."
    // },
]