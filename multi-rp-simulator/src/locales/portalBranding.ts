export type SupportedLocale = 'en' | 'fr';

const portalBranding = {
  en: {
    name: 'Test Secure Portal',
    accountDescription: 'Your Test Secure Portal account lets regulated entities submit legislative and supervisory reporting requirements.'
  },
  fr: {
    name: 'Test Secure Portal',
    accountDescription: 'Votre compte Test Secure Portal permet aux entités réglementées de soumettre leurs exigences de production de rapports législatifs et de surveillance.'
  }
};

export function getPortalCopy(lang: SupportedLocale) {
  const portalName = portalBranding[lang].name;
  const accountDescription = portalBranding[lang].accountDescription;

  if (lang === 'fr') {
    return {
      title_h: portalName,
      fcac_portal_title: portalName,
      fcac_portal_account_desc: accountDescription,
      fcac_portal_image_alt: `Image de présentation du ${portalName}`,
      fcac_signin_option_heading: `Connectez-vous au ${portalName}`,
      fcac_signin_page_title: `Connectez-vous au ${portalName}`,
      fcac_register_heading: `Créer un compte ${portalName}`,
      appbar_rp_heading: portalName,
      migration_intro_emphasis: `conserver les informations de votre compte ${portalName}.`
    };
  }

  return {
    title_h: portalName,
    fcac_portal_title: portalName,
    fcac_portal_account_desc: accountDescription,
    fcac_portal_image_alt: `${portalName} overview image`,
    fcac_signin_option_heading: `Sign in to the ${portalName}`,
    fcac_signin_page_title: `Sign in to the ${portalName}`,
    fcac_register_heading: `Register for the ${portalName}`,
    appbar_rp_heading: portalName,
    migration_intro_emphasis: `keep your existing ${portalName} account data.`
  };
}
