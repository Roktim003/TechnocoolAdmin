/** The two base sample projects (created with the other sample masters, while there are no projects). */
export const SAMPLE_PROJECTS = [
  {
    name: "Gulshan Office Tower — VRV installation",
    clientName: "Green Tower Developers Ltd.",
    clientContactPerson: "Procurement",
    clientPhone: "+880 1811 000000",
    siteAddress: "Road 90, Gulshan 2, Dhaka",
    projectType: "OFFICE",
    status: "RUNNING",
    startDate: "2026-08-01",
    expectedEndDate: "2027-01-31",
    siteEngineerName: "Rafiq Ahmed",
    contractValue: "4500000.00",
  },
  {
    name: "Chattogram Hospital — chiller plant",
    clientName: "Port City Health Trust",
    clientContactPerson: "Facilities office",
    siteAddress: "Agrabad, Chattogram",
    projectType: "HOSPITAL",
    status: "PLANNING",
    startDate: "2026-12-01",
    expectedEndDate: "2027-06-30",
    siteEngineerName: null,
    contractValue: "12000000.00",
  },
] as const;
