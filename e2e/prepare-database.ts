import globalSetup from './global-setup';

globalSetup({} as Parameters<typeof globalSetup>[0]).catch((error) => {
  console.error(error);
  process.exit(1);
});
