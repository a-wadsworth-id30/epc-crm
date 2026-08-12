describe("closed CRM authentication", () => {
  beforeEach(() => {
    cy.viewport(1440, 900);
  });

  it("redirects protected routes to login", () => {
    cy.visit("/clients");
    cy.location("pathname").should("eq", "/signin");
  });

  it("logs in, opens user management, and logs out", () => {
    cy.visit("/signin");

    cy.env<{
      ADMIN_EMAIL?: string;
      ADMIN_PASSWORD?: string;
    }>(["ADMIN_EMAIL", "ADMIN_PASSWORD"]).then(
      ({ ADMIN_EMAIL, ADMIN_PASSWORD }) => {
        cy.get('input[name="email"]').type(ADMIN_EMAIL || "admin@example.com");
        cy.get('input[name="password"]').type(
          ADMIN_PASSWORD || "ChangeMe123!",
          { log: false },
        );
      },
    );
    cy.contains("button", "Sign in").click();

    cy.location("pathname").should("eq", "/");
    cy.get("main").find("h1").contains("Dashboard").should("be.visible");

    cy.visit("/settings/users");
    cy.get("main")
      .find("h1")
      .contains("Users & Permissions")
      .should("be.visible");
    cy.contains("button", "Add user").should("be.visible");

    cy.get('header button[aria-label="Open user menu"]').click();
    cy.contains("button", "Sign out").click();
    cy.location("pathname").should("eq", "/signin");
  });
});
