{ pkgs, ... }:

{
  # Disable cachix for faster startup
  cachix.enable = false;

  # Languages
  languages = {
    javascript = {
      enable = true;
      package = pkgs.nodejs_20;
      npm.enable = true;
    };
    typescript.enable = true;
  };

  # System packages
  packages = with pkgs; [
    git
    nodejs_20
    postgresql_16  # For pg_config, psql, etc.
  ];

  # Enable .env file loading
  dotenv.enable = true;

  # PostgreSQL service for Prisma (with pgvector)
  services.postgres = {
    enable = true;
    package = pkgs.postgresql_16;
    extensions = extensions: [ extensions.pgvector ];
    listen_addresses = "*";
    port = 5432;
    initialDatabases = [
      {
        name = "meet_without_fear";
        user = "mwf_user";
        pass = "mwf_password";
      }
      {
        name = "meet_without_fear_shadow";
        user = "mwf_user";
        pass = "mwf_password";
      }
      {
        name = "meet_without_fear_test";
        user = "mwf_user";
        pass = "mwf_password";
      }
    ];
    initialScript = ''
      ALTER USER mwf_user LOGIN CREATEDB;
      CREATE EXTENSION IF NOT EXISTS vector;
    '';
  };

  # Test database URL
  env.DATABASE_URL_TEST = "postgresql://mwf_user:mwf_password@localhost:5432/meet_without_fear_test";

  # Setup script
  scripts.setup.exec = ''
    echo "Installing dependencies and generating Prisma client..."
    npm install
    npm run prisma -- generate
    npm run migrate
  '';

  # Shell hook
  enterShell = ''
    echo "Welcome to Meet Without Fear"
    echo ""
    echo "Available commands:"
    echo "  setup          - Install deps and run migrations"
    echo "  npm run dev:api     - Start backend API"
    echo "  npm run dev:mobile  - Start mobile app"
    echo "  npm run test        - Run all tests"
    echo "  npm run check       - Type check all workspaces"
    echo ""
    echo "PostgreSQL is running on port 5432"
    echo "Database: meet_without_fear"
    echo ""
  '';
}
