import React, { useCallback, useState } from 'react';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import { Page, Content, Header } from '@backstage/core-components';
import { SearchBar } from '../catalog/SearchBar';
import { WizardCard } from '../catalog/WizardCard';
import { useApi } from '@backstage/core-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import useAsync from 'react-use/lib/useAsync';
import { Entity } from '@backstage/catalog-model';
import { useFavorites } from '../../helpers/Favorite';
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import Typography from '@mui/material/Typography';
import Select from '@mui/material/Select';
import { SelectMenuProps } from '../../helpers/SelectMenuProps';
import MenuItem from '@mui/material/MenuItem';
import FormGroup from '@mui/material/FormGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';

export const WizardCatalog = () => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const catalogApi = useApi(catalogApiRef);
  const [wizardItems, setWizardItems] = useState<Array<Entity>>([]);
  const { isFavorite } = useFavorites();

  const domains = [
    { value: 'aap-operations', label: 'AAP Operations' },
    { value: 'intermediate', label: 'Intermediate' },
    { value: 'network', label: 'Network' },
    { value: 'windows', label: 'Windows' },
    { value: 'rhel', label: 'RHEL' },
  ];

  const owners = [{ value: 'RedHat', label: 'RedHat' }];

  // Filter state
  const [filterData, setFilterData] = useState({
    domain: undefined,
    type: ['wizard', 'service'],
    owner: undefined,
  } as {
    domain: string | undefined;
    type: Array<string>;
    owner: string | undefined;
  });

  const resetFilters = () => {
    setFilterData({
      domain: undefined,
      type: ['wizard', 'service'],
      owner: undefined,
    });
  };

  const updateFilterData = (key: string, value: any) => {
    setFilterData(prevFilterData => ({
      ...prevFilterData,
      [key]: value,
    }));
  };

  const handleTypeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = event.target;
    setFilterData(prevFilterData => ({
      ...prevFilterData,
      type: checked
        ? [...prevFilterData.type, name]
        : prevFilterData.type.filter(item => item !== name),
    }));
  };

  const fetchWizardItems = useCallback(async () => {
    const filter = { kind: 'template' } as { [key: string]: any };
    const queryParams: any = { filter };

    let response;
    let needFilter = false;
    if (searchTerm) {
      queryParams.fullTextFilter = {
        term: searchTerm,
        fields: ['metadata.name', 'metadata.title', 'spec.profile.displayName'],
      };
      needFilter = true;
    }
    if (filterData?.owner) {
      filter['spec.owner'] = filterData.owner;
    }
    if (filterData?.type.length !== 2) {
      filter['spec.type'] = filterData.type;
    }
    if (filterData?.domain) {
      filter['metadata.tags'] = filterData.domain;
    }
    if (needFilter) {
      response = await catalogApi.queryEntities(queryParams);
    } else {
      response = await catalogApi.getEntities(queryParams);
    }

    setWizardItems(response.items as Array<Entity>);
  }, [searchTerm, filterData, catalogApi]);

  useAsync(fetchWizardItems, [searchTerm, filterData, catalogApi]);

  const handleSearchChange = (searchValue: string) => {
    setSearchTerm(searchValue);
  };

  return (
    <Page themeId="tool">
      <Header
        pageTitleOverride="Wizard Catalog"
        title="Automation Templates"
        subtitle={`
          Browse through certified automation content and search for off the shelf job templates that fits your needs.
          Upon launching a template, a new job template will be created in AAP and will automatically run.
        `}
      >
        <Button href="/catalog-import" variant="contained">
          Add Template
        </Button>
      </Header>
      <Content>
        <Box sx={{ padding: '17px 0 33px' }}>
          <SearchBar onSearchChange={handleSearchChange} />
        </Box>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={12} md={4} lg={2}>
            <Box
              display="flex"
              alignItems="center"
              justifyContent="space-between"
            >
              <h2>Filters</h2>
              <Button variant="text" color="primary" onClick={resetFilters}>
                Clear all
              </Button>
            </Box>
            <hr />
            <Box component="form" display="flex" flexDirection="column">
              <FormControl fullWidth variant="outlined">
                <Box mt={2} mb={1} display="flex" justifyContent="flex-start">
                  <Typography variant="body2" style={{ fontWeight: 'bold' }}>
                    Domain
                  </Typography>
                </Box>
                <Select
                  variant="outlined"
                  value={filterData.domain || ''}
                  labelId="domain-select-label"
                  onChange={e => updateFilterData('domain', e.target.value)}
                  displayEmpty
                  inputProps={{ 'aria-label': 'Without label' }}
                  MenuProps={SelectMenuProps}
                >
                  <MenuItem value="" sx={{ display: 'block' }}>
                    <em>All</em>
                  </MenuItem>
                  {domains.map(domain => (
                    <MenuItem key={domain.value} value={domain.value}>
                      {domain.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl fullWidth component="fieldset">
                <Box mt={2} mb={1} display="flex" justifyContent="flex-start">
                  <Typography variant="body2" style={{ fontWeight: 'bold' }}>
                    Type
                  </Typography>
                </Box>
                <FormGroup>
                  <FormControlLabel
                    key="wizard"
                    control={
                      <Checkbox
                        checked={filterData.type.includes('wizard')}
                        onChange={handleTypeChange}
                        name="wizard"
                      />
                    }
                    label="Wizard"
                    style={{ marginLeft: '0', marginBottom: '12px' }} // 12px space between checkboxes
                  />
                  <FormControlLabel
                    key="service"
                    control={
                      <Checkbox
                        checked={filterData.type.includes('service')}
                        onChange={handleTypeChange}
                        name="service"
                      />
                    }
                    label="Service"
                    style={{ marginLeft: '0', marginBottom: '12px' }} // 12px space between checkboxes
                  />
                </FormGroup>
              </FormControl>

              <FormControl fullWidth variant="outlined">
                <Box mt={2} mb={1} display="flex" justifyContent="flex-start">
                  <Typography variant="body2" style={{ fontWeight: 'bold' }}>
                    Owner
                  </Typography>
                </Box>
                <Select
                  variant="outlined"
                  value={filterData.owner || ''}
                  onChange={e => updateFilterData('owner', e.target.value)}
                  displayEmpty
                  inputProps={{ 'aria-label': 'Without label' }}
                  MenuProps={SelectMenuProps}
                >
                  <MenuItem value="">
                    <em>All</em>
                  </MenuItem>
                  {owners.map(owner => (
                    <MenuItem key={owner.value} value={owner.value}>
                      {owner.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
          </Grid>
          <Grid item xs={12} sm={12} md={8} lg={10}>
            <Grid
              container
              spacing={5}
              alignItems="stretch"
              style={{ marginBottom: '66px' }}
            >
              {wizardItems
                ?.filter(item =>
                  isFavorite(item.metadata?.namespace, item.metadata?.name),
                )
                ?.map((wizardItem, index) => (
                  <Grid
                    item
                    sm={12}
                    md={6}
                    lg={3}
                    key={index}
                    style={{ display: 'flex' }}
                  >
                    <WizardCard wizardItem={wizardItem} />
                  </Grid>
                ))}
            </Grid>
            <Grid
              container
              spacing={5}
              alignItems="stretch"
              style={{ marginBottom: '46px' }}
            >
              {wizardItems
                ?.filter(
                  item =>
                    !isFavorite(item.metadata?.namespace, item.metadata?.name),
                )
                ?.map((wizardItem, index) => (
                  <Grid
                    item
                    xs={12}
                    sm={6}
                    md={4}
                    lg={3}
                    key={index}
                    style={{ display: 'flex' }}
                  >
                    <WizardCard wizardItem={wizardItem} />
                  </Grid>
                ))}
            </Grid>
          </Grid>
        </Grid>
      </Content>
    </Page>
  );
};
