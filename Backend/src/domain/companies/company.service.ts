/**
 * Company domain service — Phase 3, Task 3.2.
 *
 * The Company is the root tenant boundary (BACKEND_DATABASE.md §6). This service owns
 * company creation, retrieval, and status transitions. Every other domain object is
 * scoped beneath a company; those services require a companyId on every call so a
 * caller authenticated as company A can never reach company B's data (§54, §50).
 */
import type { Company, CompanyStatus, PrismaClient } from "@prisma/client";
import { CoreError } from "../../shared/errors/index.js";

export class CompanyService {
  constructor(private readonly db: PrismaClient) {}

  /** Create a new tenant. */
  async createCompany(input: { name: string }): Promise<Company> {
    const name = input.name?.trim();
    if (!name) {
      throw CoreError.of("INVALID_INPUT", "Company name is required.");
    }
    return this.db.company.create({ data: { name } });
  }

  /** Fetch a company by id, or null if it does not exist. */
  async getCompany(companyId: string): Promise<Company | null> {
    return this.db.company.findUnique({ where: { id: companyId } });
  }

  /** Fetch a company or throw NOT_FOUND. */
  async requireCompany(companyId: string): Promise<Company> {
    const company = await this.getCompany(companyId);
    if (!company) {
      throw CoreError.of("NOT_FOUND", "Company not found.", {
        details: { companyId },
      });
    }
    return company;
  }

  /** Transition a company's lifecycle status. */
  async updateCompanyStatus(companyId: string, status: CompanyStatus): Promise<Company> {
    await this.requireCompany(companyId);
    return this.db.company.update({ where: { id: companyId }, data: { status } });
  }
}
