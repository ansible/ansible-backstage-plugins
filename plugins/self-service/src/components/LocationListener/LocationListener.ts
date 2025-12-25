import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * LocationListener component that redirects users from standard Backstage
 * scaffolder routes to the self-service filtered routes.
 *
 * This is important for security because:
 * - The standard /create endpoint shows ALL templates without AAP permission filtering
 * - The /self-service/catalog endpoint properly filters templates based on user's AAP permissions
 *
 * By redirecting /create and /create/* paths, we ensure users can only see
 * templates they have access to in Ansible Automation Platform.
 */
export const LocationListener = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect root to self-service catalog
    if (pathname === '/') {
      navigate('/self-service/catalog', { replace: true });
      return undefined;
    }

    // Redirect ALL /create paths to self-service catalog
    // This prevents users from accessing the unfiltered ScaffolderPage
    // which would show all templates regardless of AAP permissions
    if (pathname === '/create') {
      navigate('/self-service/catalog', { replace: true });
      return undefined;
    }

    // Redirect /create/templates/* to self-service equivalents
    // Match paths like /create/templates/default/my-template
    const templateMatch = pathname.match(
      /^\/create\/templates\/([^/]+)\/([^/]+)$/,
    );
    if (templateMatch) {
      const [, namespace, templateName] = templateMatch;
      navigate(`/self-service/create/templates/${namespace}/${templateName}`, {
        replace: true,
      });
      return undefined;
    }

    // Redirect /create/tasks to self-service tasks list
    if (pathname === '/create/tasks') {
      navigate('/self-service/create/tasks', { replace: true });
      return undefined;
    }

    // Redirect /create/tasks/:taskId to self-service task details
    // Match paths like /create/tasks/abc123
    const taskMatch = pathname.match(/^\/create\/tasks\/([^/]+)$/);
    if (taskMatch) {
      const [, taskId] = taskMatch;
      navigate(`/self-service/create/tasks/${taskId}`, { replace: true });
      return undefined;
    }

    // Catch-all for any other /create/* paths - redirect to self-service catalog
    if (pathname.startsWith('/create/') || pathname.startsWith('/create?')) {
      navigate('/self-service/catalog', { replace: true });
      return undefined;
    }

    // Redirect catalog-import
    if (pathname === '/catalog-import') {
      navigate('/self-service/catalog-import', { replace: true });
      return undefined;
    }

    // Handle /catalog/default/template/* paths - redirect to self-service catalog details
    if (pathname.includes('/catalog/default/template/')) {
      const templateName = pathname.split('/').pop();
      if (templateName) {
        navigate(`/self-service/catalog/default/${templateName}`, {
          replace: true,
        });
        return undefined;
      }
    }

    // Hide specific UI elements on catalog-import page
    if (pathname === '/self-service/catalog-import') {
      const linksInterval = setInterval(() => {
        let element = document.evaluate(
          '//*[@id="root"]/div/div/main/article/div/div[2]/div/div/div/div[7]/div/div/div/div/ul/div/div/div/div/a[1]',
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null,
        ).singleNodeValue as HTMLElement;
        if (element) {
          element.style.display = 'none';
          element = document.evaluate(
            '//*[@id="root"]/div/div/main/article/div/div[2]/div/div/div/div[7]/div/div/div/div/ul/div/div/div/div/a[2]',
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null,
          ).singleNodeValue as HTMLElement;
          if (element) {
            element.style.display = 'none';
          }
          clearInterval(linksInterval);
        }
      }, 500);

      return () => clearInterval(linksInterval);
    }

    return undefined;
  }, [pathname, navigate]);

  return null;
};
