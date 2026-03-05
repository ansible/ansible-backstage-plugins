import { ConfigReader } from '@backstage/config';
import { readAnsibleGitContentsConfigs, getDefaultHost } from '../config';

describe('config', () => {
  // Suppress console.log during tests
  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  describe('readAnsibleGitContentsConfigs', () => {
    it('should return empty array when no rhaap config exists', () => {
      const config = new ConfigReader({});
      const result = readAnsibleGitContentsConfigs(config);
      expect(result).toEqual([]);
    });

    it('should return empty array when ansibleGitContents is not configured', () => {
      const config = new ConfigReader({
        catalog: {
          providers: {
            rhaap: {
              development: {
                orgs: 'Default',
              },
            },
          },
        },
      });
      const result = readAnsibleGitContentsConfigs(config);
      expect(result).toEqual([]);
    });

    it('should return empty array when ansibleGitContents is disabled', () => {
      const config = new ConfigReader({
        catalog: {
          providers: {
            rhaap: {
              development: {
                sync: {
                  ansibleGitContents: {
                    enabled: false,
                  },
                },
              },
            },
          },
        },
      });
      const result = readAnsibleGitContentsConfigs(config);
      expect(result).toEqual([]);
    });

    it('should return empty array when no providers are configured', () => {
      const config = new ConfigReader({
        catalog: {
          providers: {
            rhaap: {
              development: {
                sync: {
                  ansibleGitContents: {
                    enabled: true,
                  },
                },
              },
            },
          },
        },
      });
      const result = readAnsibleGitContentsConfigs(config);
      expect(result).toEqual([]);
    });

    it('should parse github provider config', () => {
      const config = new ConfigReader({
        catalog: {
          providers: {
            rhaap: {
              development: {
                sync: {
                  ansibleGitContents: {
                    enabled: true,
                    providers: {
                      github: [
                        {
                          name: 'GitHub.com',
                          orgs: [
                            {
                              name: 'ansible',
                              schedule: {
                                frequency: { minutes: 30 },
                                timeout: { minutes: 10 },
                              },
                            },
                          ],
                        },
                      ],
                    },
                  },
                },
              },
            },
          },
        },
      });

      const result = readAnsibleGitContentsConfigs(config);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        enabled: true,
        scmProvider: 'github',
        hostName: 'GitHub.com',
        organization: 'ansible',
        env: 'development',
      });
    });

    it('should parse gitlab provider config', () => {
      const config = new ConfigReader({
        catalog: {
          providers: {
            rhaap: {
              development: {
                sync: {
                  ansibleGitContents: {
                    enabled: true,
                    providers: {
                      gitlab: [
                        {
                          name: 'gitlab.example.com',
                          host: 'gitlab.example.com',
                          orgs: [
                            {
                              name: 'mygroup',
                              schedule: {
                                frequency: { minutes: 60 },
                                timeout: { minutes: 15 },
                              },
                            },
                          ],
                        },
                      ],
                    },
                  },
                },
              },
            },
          },
        },
      });

      const result = readAnsibleGitContentsConfigs(config);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        enabled: true,
        scmProvider: 'gitlab',
        hostName: 'gitlab.example.com',
        host: 'gitlab.example.com',
        organization: 'mygroup',
        env: 'development',
      });
    });

    it('should parse multiple orgs under one host', () => {
      const config = new ConfigReader({
        catalog: {
          providers: {
            rhaap: {
              development: {
                sync: {
                  ansibleGitContents: {
                    enabled: true,
                    providers: {
                      github: [
                        {
                          name: 'GitHub.com',
                          orgs: [
                            {
                              name: 'ansible',
                              schedule: {
                                frequency: { minutes: 30 },
                                timeout: { minutes: 10 },
                              },
                            },
                            {
                              name: 'redhat',
                              schedule: {
                                frequency: { minutes: 30 },
                                timeout: { minutes: 10 },
                              },
                            },
                          ],
                        },
                      ],
                    },
                  },
                },
              },
            },
          },
        },
      });

      const result = readAnsibleGitContentsConfigs(config);

      expect(result).toHaveLength(2);
      expect(result[0].organization).toBe('ansible');
      expect(result[1].organization).toBe('redhat');
    });

    it('should parse both github and gitlab providers', () => {
      const config = new ConfigReader({
        catalog: {
          providers: {
            rhaap: {
              development: {
                sync: {
                  ansibleGitContents: {
                    enabled: true,
                    providers: {
                      github: [
                        {
                          name: 'GitHub.com',
                          orgs: [
                            {
                              name: 'ansible',
                              schedule: {
                                frequency: { minutes: 30 },
                                timeout: { minutes: 10 },
                              },
                            },
                          ],
                        },
                      ],
                      gitlab: [
                        {
                          name: 'GitLab.com',
                          orgs: [
                            {
                              name: 'mygroup',
                              schedule: {
                                frequency: { minutes: 60 },
                                timeout: { minutes: 15 },
                              },
                            },
                          ],
                        },
                      ],
                    },
                  },
                },
              },
            },
          },
        },
      });

      const result = readAnsibleGitContentsConfigs(config);

      expect(result).toHaveLength(2);
      expect(result.find(s => s.scmProvider === 'github')).toBeDefined();
      expect(result.find(s => s.scmProvider === 'gitlab')).toBeDefined();
    });

    it('should use common schedule when org schedule is not provided', () => {
      const config = new ConfigReader({
        catalog: {
          providers: {
            rhaap: {
              development: {
                sync: {
                  ansibleGitContents: {
                    enabled: true,
                    schedule: {
                      frequency: { hours: 1 },
                      timeout: { minutes: 20 },
                    },
                    providers: {
                      github: [
                        {
                          name: 'GitHub.com',
                          orgs: [
                            {
                              name: 'ansible',
                            },
                          ],
                        },
                      ],
                    },
                  },
                },
              },
            },
          },
        },
      });

      const result = readAnsibleGitContentsConfigs(config);

      expect(result).toHaveLength(1);
      expect(result[0].schedule).toBeDefined();
    });

    it('should parse optional org config fields', () => {
      const config = new ConfigReader({
        catalog: {
          providers: {
            rhaap: {
              development: {
                sync: {
                  ansibleGitContents: {
                    enabled: true,
                    providers: {
                      github: [
                        {
                          name: 'GitHub.com',
                          orgs: [
                            {
                              name: 'ansible',
                              branches: ['main', 'develop'],
                              tags: ['v1.*', 'v2.*'],
                              galaxyFilePaths: [
                                'galaxy.yml',
                                'collections/galaxy.yml',
                              ],
                              crawlDepth: 3,
                              schedule: {
                                frequency: { minutes: 30 },
                                timeout: { minutes: 10 },
                              },
                            },
                          ],
                        },
                      ],
                    },
                  },
                },
              },
            },
          },
        },
      });

      const result = readAnsibleGitContentsConfigs(config);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        branches: ['main', 'develop'],
        tags: ['v1.*', 'v2.*'],
        galaxyFilePaths: ['galaxy.yml', 'collections/galaxy.yml'],
        crawlDepth: 3,
      });
    });

    it('should use default crawlDepth of 5 when not provided', () => {
      const config = new ConfigReader({
        catalog: {
          providers: {
            rhaap: {
              development: {
                sync: {
                  ansibleGitContents: {
                    enabled: true,
                    providers: {
                      github: [
                        {
                          name: 'GitHub.com',
                          orgs: [
                            {
                              name: 'ansible',
                              schedule: {
                                frequency: { minutes: 30 },
                                timeout: { minutes: 10 },
                              },
                            },
                          ],
                        },
                      ],
                    },
                  },
                },
              },
            },
          },
        },
      });

      const result = readAnsibleGitContentsConfigs(config);

      expect(result[0].crawlDepth).toBe(5);
    });

    it('should skip hosts with no orgs configured', () => {
      const config = new ConfigReader({
        catalog: {
          providers: {
            rhaap: {
              development: {
                sync: {
                  ansibleGitContents: {
                    enabled: true,
                    providers: {
                      github: [
                        {
                          name: 'GitHub.com',
                        },
                      ],
                    },
                  },
                },
              },
            },
          },
        },
      });

      const result = readAnsibleGitContentsConfigs(config);
      expect(result).toEqual([]);
    });

    it('should parse multiple environments', () => {
      const config = new ConfigReader({
        catalog: {
          providers: {
            rhaap: {
              development: {
                sync: {
                  ansibleGitContents: {
                    enabled: true,
                    providers: {
                      github: [
                        {
                          name: 'GitHub.com',
                          orgs: [
                            {
                              name: 'dev-org',
                              schedule: {
                                frequency: { minutes: 30 },
                                timeout: { minutes: 10 },
                              },
                            },
                          ],
                        },
                      ],
                    },
                  },
                },
              },
              production: {
                sync: {
                  ansibleGitContents: {
                    enabled: true,
                    providers: {
                      github: [
                        {
                          name: 'GitHub.com',
                          orgs: [
                            {
                              name: 'prod-org',
                              schedule: {
                                frequency: { hours: 1 },
                                timeout: { minutes: 15 },
                              },
                            },
                          ],
                        },
                      ],
                    },
                  },
                },
              },
            },
          },
        },
      });

      const result = readAnsibleGitContentsConfigs(config);

      expect(result).toHaveLength(2);
      expect(
        result.find(
          s => s.env === 'development' && s.organization === 'dev-org',
        ),
      ).toBeDefined();
      expect(
        result.find(
          s => s.env === 'production' && s.organization === 'prod-org',
        ),
      ).toBeDefined();
    });
  });

  describe('getDefaultHost', () => {
    it('should return github.com for github provider', () => {
      expect(getDefaultHost('github')).toBe('github.com');
    });

    it('should return gitlab.com for gitlab provider', () => {
      expect(getDefaultHost('gitlab')).toBe('gitlab.com');
    });
  });
});
