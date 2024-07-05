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
import { Link } from "@backstage/core-components";
import { Tool } from "@backstage/plugin-home";
import OpenInNew from "@material-ui/icons/OpenInNew";
import React from "react";
import { WorkspaceIcon } from "../WorkspaceIcon";
import { DocumentIcon } from "../DocumentIcon";

export interface IQuickAccessLinks {
    name?: string;
    description?: React.ReactNode;
    showButton?: boolean;
    button?: {
        text?: string;
        url?: string;
        fallbackUrl?: string;
        isExternalUrl?: boolean;
    }
    showDocsLink?: boolean;
    docs?: {
        text?: string;
        url?: string;
    }
    items?: Tool[];
}

export const learn: IQuickAccessLinks = {
    name: 'Learn',
    description: (
        <div>
            Learning paths are tutorials that guide you through common Ansible tasks.
            New and experienced users alike can get up-to-speed with learning paths based on the latest Ansible Automation Platform versions and best practices.
            Learn more on the&nbsp;
            <Link to="https://red.ht/aap-rhd-learning-paths">
                Red Hat Developer website. <OpenInNew fontSize="small" style={{fontSize: '14px'}}/>
            </Link>
        </div>
    ),
    // Link: https://red.ht/aap-rhd-learning-paths
    showButton: true,
    button: {
        text: 'Start Learning Path',
        url: '../learn',
        isExternalUrl: false,
    },
}

export const discoverContent: IQuickAccessLinks = {
    name: 'Discover existing collections',
    description: 'Leverage existing collections and execution environments from Automation Hub. Private Automation Hub is a self-hosted Ansible content management system. Organizations can host provate hubs on their own infrastructure and manage it themselves.',
    showButton: true,
    button: {
        text: 'Go to Automation Hub',
        url: 'app-config:ansible.automationHub.baseUrl',
        fallbackUrl: 'https://console.redhat.com/ansible/automation-hub/',
        isExternalUrl: true
    },
    showDocsLink: true,
    docs: {
        text: "View documentation",
        url: "https://red.ht/aap-pah-managing-content"
    },
};

export const create: IQuickAccessLinks = {
    name: 'Create',
    description: 'Create new Git projects with a single, clear, opinionated method to accomplish a specific task.',
    showButton: true,
    button: {
        text: 'Create Ansible Git Project',
        url: '../create',
        isExternalUrl: false,
    }
}

export const develop: IQuickAccessLinks = {
    name: 'Develop',
    description: (
        <div>
            Develop with Ansible Development Workspaces. Ansible development ready cloud environment with VSCode.
            <br />
            You can also use our&nbsp;
            <Link to="https://marketplace.visualstudio.com/items?itemName=redhat.ansible">
                Visual Studio Code Extension instead. <OpenInNew fontSize="small" style={{fontSize: '14px'}}/>
            </Link>
        </div>
    ),
    // https://marketplace.visualstudio.com/items?itemName=redhat.ansible
    showButton: true,
    button: {
        text: 'Go to OpenShift Dev Spaces Dashboard',
        url: 'app-config:ansible.devSpaces.baseUrl',
        fallbackUrl: 'https://red.ht/aap-developer-tools',
        isExternalUrl: true
    },
    showDocsLink: true,
    docs: {
        text: "View documentation",
        url: "https://red.ht/aap-ansible-dev-workspaces"
    },
};

export const operate: IQuickAccessLinks = {
    name: 'Operate',
    description: 'Manage your automation with Ansible Automation Platform. Red Hat Ansible Automation Platform is and end-to-end automation platform to configure systems, deploy software, and orchestrate advanced workflows. It includes resources to create, manage and scale across the entire enterprise.',
    showButton: true,
    button: {
        text: 'Go to Ansible Automation Platform',
        url: 'app-config:ansible.aap.baseUrl',
        fallbackUrl: 'https://www.redhat.com/en/technologies/management/ansible/trial',
        isExternalUrl: true
    },
    showDocsLink: true,
    docs: {
        text: "View documentation",
        url: "https://red.ht/aap-docs",
    },
};

export const developmentTools: IQuickAccessLinks = {
    name: 'Useful Links',
    items: [
        {
        url: 'https://red.ht/aap-developer-tools',
        label: 'Ansible developer tools',
        icon: <WorkspaceIcon />,
        },
        {
        url: 'https://red.ht/aap-creator-guide',
        label: 'Ansible content creator guide',
        icon: <DocumentIcon />,
        },
        {
        url: 'https://docs.ansible.com/ansible/latest/reference_appendices/glossary.html',
        label: 'Ansible definitions',
        icon: <DocumentIcon />,
        },
    ],
};

export const allData = {
    learn: learn,
    discoverContent: discoverContent,
    develop: develop,
    create: create,
    operate: operate,
    developmentTools: developmentTools
}

// PAH to get link from app config
// Develop to open openshift dev spaces link using app config
// Operate go to AAP to come from config map