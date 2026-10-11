const normalizeMetadataName = (value) => String(value ?? "").trim();

export const buildProfileAuthMetadata = (profile = {}) => {
  const firstName = normalizeMetadataName(profile.first_name ?? profile.firstName);
  const lastName = normalizeMetadataName(profile.last_name ?? profile.lastName);
  const fullName = [firstName, lastName].filter(Boolean).join(" ");

  return {
    first_name: firstName,
    last_name: lastName,
    full_name: fullName,
    display_name: fullName,
  };
};

export const mergeProfileAuthMetadata = (metadata = {}, profile = {}) => ({
  ...(metadata && typeof metadata === "object" ? metadata : {}),
  ...buildProfileAuthMetadata(profile),
});
