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
    nodejs
  ];

  # Enable .env file loading
  dotenv.enable = true;

  # PostgreSQL service for Prisma
  services.postgres = {
    enable = true;
    listen_addresses = "*";
    port = 5432;
    initialDatabases = [
      {
        name = "listen_well";
        user = "listen_well_user";
        pass = "listen_well_password";
      }
      {
        name = "listen_well_shadow";
        user = "listen_well_user";
        pass = "listen_well_password";
      }
      {
        name = "listen_well_test";
        user = "listen_well_user";
        pass = "listen_well_password";
      }
    ];
    initialScript = ''
      ALTER USER listen_well_user LOGIN CREATEDB;
    '';
  };

  # Test database URL
  env.DATABASE_URL_TEST = "postgresql://listen_well_user:listen_well_password@localhost:5432/listen_well_test";

  # Setup script
  scripts.setup.exec = ''
    echo "Installing dependencies and generating Prisma client..."
    npm install
    npm run prisma -- generate
    npm run migrate
  '';

  # Shell hook
  enterShell = ''
    echo "Welcome to Listen Well (BeHeard MVP)"
    echo ""
    echo "Available commands:"
    echo "  setup          - Install deps and run migrations"
    echo "  npm run dev:api     - Start backend API"
    echo "  npm run dev:mobile  - Start mobile app"
    echo "  npm run test        - Run all tests"
    echo "  npm run check       - Type check all workspaces"
    echo ""
    echo "PostgreSQL is running on port 5432"
    echo "Database: listen_well"
    echo ""
  '';
}
