export type CompanyMergeProfile = {
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  companyTypeId: string | null;
  country: string | null;
  county: string | null;
  domain: string | null;
  owner: string | null;
  ownerUserId: string | null;
  parentCompanyId: string | null;
  postcode: string | null;
};

function preferPrimary<T>(primary: T | null, duplicate: T | null) {
  return primary ?? duplicate ?? null;
}

export function mergedCompanyProfile({
  duplicate,
  primary,
}: {
  duplicate: CompanyMergeProfile & { id: string };
  primary: CompanyMergeProfile & { id: string };
}): CompanyMergeProfile {
  const primaryHasOwner = Boolean(primary.ownerUserId || primary.owner);
  const primaryParent =
    primary.parentCompanyId === duplicate.id
      ? duplicate.parentCompanyId
      : primary.parentCompanyId;
  const duplicateParent =
    duplicate.parentCompanyId === primary.id ? null : duplicate.parentCompanyId;
  const parentCompanyId = preferPrimary(primaryParent, duplicateParent);

  return {
    addressLine1: preferPrimary(primary.addressLine1, duplicate.addressLine1),
    addressLine2: preferPrimary(primary.addressLine2, duplicate.addressLine2),
    city: preferPrimary(primary.city, duplicate.city),
    companyTypeId: preferPrimary(
      primary.companyTypeId,
      duplicate.companyTypeId,
    ),
    country: preferPrimary(primary.country, duplicate.country),
    county: preferPrimary(primary.county, duplicate.county),
    domain: preferPrimary(primary.domain, duplicate.domain),
    owner: primaryHasOwner ? primary.owner : duplicate.owner,
    ownerUserId: primaryHasOwner
      ? primary.ownerUserId
      : duplicate.ownerUserId,
    parentCompanyId:
      parentCompanyId === primary.id || parentCompanyId === duplicate.id
        ? null
        : parentCompanyId,
    postcode: preferPrimary(primary.postcode, duplicate.postcode),
  };
}
