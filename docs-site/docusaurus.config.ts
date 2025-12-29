import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Meet Without Fear MVP Planning',
  tagline: 'Meet Without Fear MVP Planning Documentation',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  url: 'https://meet-without-fear-planning.vercel.app',
  baseUrl: '/',

  onBrokenLinks: 'warn',
  onBrokenMarkdownLinks: 'warn',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  // Mermaid support
  markdown: {
    mermaid: true,
  },
  themes: ['@docusaurus/theme-mermaid'],

  presets: [
    [
      'classic',
      {
        docs: {
          path: './docs',
          routeBasePath: '/',
          sidebarPath: './sidebars.ts',
        },
        blog: false,
        pages: false,
        debug: false, // Disable debug plugin to avoid v4 compatibility issues
        theme: {
          customCss: './src/css/custom.css',
        },
        sitemap: {
          lastmod: 'date',
          changefreq: 'weekly',
          priority: 0.5,
          ignorePatterns: ['/tags/**'],
          filename: 'sitemap.xml',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'Meet Without Fear MVP Planning',
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'mvpSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          type: 'html',
          position: 'left',
          value: '<a href="/demo/features/index.html" class="navbar__item navbar__link" onclick="window.location.href=this.href; return false;">Demos</a>',
        },
      ],
    },
    footer: {
      style: 'dark',
      copyright: `Meet Without Fear MVP Planning Documentation`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
