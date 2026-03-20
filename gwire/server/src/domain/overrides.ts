import type { FastifyRequest } from "fastify";
import type { OpenAPI } from "openapi-types";
import type { MockStore } from "./types.js";

/** Return undefined = skip override, null = 404, else body */
export function handleOverride(
  store: MockStore,
  operationId: string,
  req: FastifyRequest,
  operation: OpenAPI.Operation
): unknown | null | undefined {
  switch (operationId) {
    case "listCountries":
      return {
        countries: [{ isoCd: "US", name: "United States" }],
      };
    case "getCountry": {
      const iso = (req.params as { isoCd?: string }).isoCd;
      if (iso === "US") {
        return { isoCd: "US", name: "United States" };
      }
      return null;
    }
    case "listCustomers": {
      const pageSize = Math.min(
        1000,
        parseInt(String((req.query as { page_size?: string }).page_size ?? "100"), 10) || 100
      );
      return {
        customers: store.customers.slice(0, pageSize),
        nextPageToken: null,
      };
    }
    case "getCustomer": {
      const id = (req.params as { systemId?: string }).systemId;
      const c = id ? store.customerById.get(id) : undefined;
      if (!c) return null;
      return c;
    }
    case "getCustomerSummary": {
      const id = (req.params as { systemId?: string }).systemId;
      if (!id) return null;
      const c = store.customerById.get(id);
      if (!c) return null;
      const pols = store.policiesByCustomerId.get(id) ?? [];
      const cl = store.claimsByCustomerId.get(id) ?? [];
      const openClaimCount = cl.filter((x) => x.status === "OPEN" || x.status === "PENDING").length;
      return {
        systemId: c.systemId,
        displayName: c.displayName,
        policyCount: pols.length,
        openClaimCount,
      };
    }
    case "listCustomerClaims": {
      const id = (req.params as { systemId?: string }).systemId;
      if (!id || !store.customerById.has(id)) return null;
      const claims = store.claimsByCustomerId.get(id) ?? [];
      return {
        claims: claims.map((cl) => ({
          systemId: cl.systemId,
          claimNumber: cl.claimNumber,
          status: cl.status,
          lossDt: cl.lossDt,
          lossType: cl.lossType,
          policySystemId: cl.policySystemId,
        })),
      };
    }
    case "listPolicies":
      return {
        policies: store.policies,
        nextPageToken: null,
      };
    case "getPolicy":
    case "getPolicyFull":
    case "getInsuredPolicyDetails": {
      const id = (req.params as { systemId?: string }).systemId;
      const p = id ? store.policyById.get(id) : undefined;
      if (!p) return null;
      if (operationId === "getInsuredPolicyDetails") {
        return {
          systemId: p.systemId,
          policyNumber: p.policyNumber,
          lineCd: p.lineCd,
          namedInsured: store.customerById.get(p.customerSystemId)?.displayName ?? "",
        };
      }
      if (operationId === "getPolicyFull") {
        return {
          ...p,
          coverages: [
            {
              coverageCd: p.lineCd === "HOME" ? "DWELL" : "COLL",
              limitAmount: p.lineCd === "HOME" ? 450000 : 100000,
            },
          ],
          risks: [{ description: p.lineCd === "HOME" ? "Primary dwelling" : "Primary vehicle" }],
        };
      }
      return p;
    }
    case "listPolicyDocuments":
    case "listInsuredDocuments": {
      const id = (req.params as { systemId?: string }).systemId;
      if (!id || !store.policyById.has(id)) return null;
      return {
        documents: [
          {
            documentId: `DOC-${id}-DECL`,
            title: "Declarations page",
          },
        ],
      };
    }
    case "getPolicyLine": {
      const { systemId, lineCd } = req.params as {
        systemId?: string;
        lineCd?: string;
      };
      const p = systemId ? store.policyById.get(systemId) : undefined;
      if (!p || !lineCd || p.lineCd !== lineCd) return null;
      return {
        lineCd: p.lineCd,
        description: p.lineCd === "HOME" ? "Homeowners" : "Personal auto",
      };
    }
    case "getClaimConsumerSummary": {
      const id = (req.params as { systemId?: string }).systemId;
      const cl = id ? store.claimById.get(id) : undefined;
      if (!cl) return null;
      return {
        systemId: cl.systemId,
        claimNumber: cl.claimNumber,
        status: cl.status,
        lossDescription: cl.lossDescription,
        paidAmount: cl.paidAmount,
        reserveAmount: cl.reserveAmount,
      };
    }
    case "listClaimDocuments": {
      const id = (req.params as { systemId?: string }).systemId;
      if (!id || !store.claimById.has(id)) return null;
      return {
        documents: [
          {
            documentId: `DOC-${id}-PHOTO`,
            title: "Loss photos",
          },
        ],
      };
    }
    case "search": {
      const q = String((req.query as { q?: string }).q ?? "").toLowerCase().trim();
      if (!q) {
        return { hits: [] };
      }
      const hits: { resourceName: string; systemId: string; title: string }[] = [];
      for (const c of store.customers) {
        if (
          c.displayName.toLowerCase().includes(q) ||
          c.primaryEmail.toLowerCase().includes(q) ||
          c.primaryPhone.includes(q) ||
          c.address.city.toLowerCase().includes(q) ||
          c.accountNumber.toLowerCase().includes(q)
        ) {
          hits.push({ resourceName: "Customer", systemId: c.systemId, title: c.displayName });
        }
      }
      for (const p of store.policies) {
        if (p.policyNumber.toLowerCase().includes(q)) {
          hits.push({
            resourceName: "Policy",
            systemId: p.systemId,
            title: p.policyNumber,
          });
        }
      }
      return { hits };
    }
    case "searchByResource": {
      const { resourceName, systemId } = req.params as {
        resourceName?: string;
        systemId?: string;
      };
      if (!resourceName || !systemId) return null;
      if (resourceName.toLowerCase() === "customer") {
        const c = store.customerById.get(systemId);
        if (!c) return null;
        return { resourceName: "Customer", systemId: c.systemId, title: c.displayName };
      }
      if (resourceName.toLowerCase() === "policy") {
        const p = store.policyById.get(systemId);
        if (!p) return null;
        return { resourceName: "Policy", systemId: p.systemId, title: p.policyNumber };
      }
      return null;
    }
    case "getApplication":
    case "getApplicationFull": {
      const id = (req.params as { systemId?: string }).systemId;
      const p = store.policies.find((pol) => pol.systemId === id);
      if (!p) return null;
      if (operationId === "getApplicationFull") {
        return {
          systemId: id,
          lines: [{ lineCd: p.lineCd, productCd: p.productCd }],
        };
      }
      return { systemId: id, status: "BOUND" };
    }
    case "listProducts":
      return {
        products: [
          { productVersionId: "HO3-CA-1", name: "Homeowners HO3 California" },
          { productVersionId: "PAP-CA-1", name: "Personal Auto California" },
        ],
      };
    case "listBillingAccounts":
      return {
        billingAccounts: store.customers.slice(0, 10).map((c) => ({
          systemId: `BILL-${c.systemId.slice(5)}`,
          accountNumber: `BILL-${c.accountNumber.slice(4)}`,
          balance: 0,
        })),
      };
    case "getBillingAccount": {
      const id = (req.params as { systemId?: string }).systemId;
      if (!id?.startsWith("BILL-")) return null;
      const suffix = id.slice(5);
      const custId = `CUST-${suffix}`;
      const c = store.customerById.get(custId);
      if (!c) return null;
      return {
        systemId: id,
        accountNumber: `BILL-${c.accountNumber.slice(4)}`,
        balance: 0,
      };
    }
    case "listTasks":
      return {
        tasks: [
          {
            systemId: "TSK-00001",
            subject: "Review open claims",
            status: "OPEN",
          },
        ],
      };
    case "getTask": {
      const id = (req.params as { systemId?: string }).systemId;
      if (id !== "TSK-00001") return null;
      return {
        systemId: id,
        subject: "Review open claims",
        status: "OPEN",
      };
    }
    case "listCoderefs":
      return { packages: [] };
    case "listUsers":
      return {
        users: [{ loginId: "gwire.admin", displayName: "GWire Admin" }],
      };
    case "listProviders":
      return {
        providers: [{ systemId: "PRV-001", name: "GWire Insurance Services" }],
      };
    default:
      return undefined;
  }
}
