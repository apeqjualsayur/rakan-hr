// DEV ONLY: eight made-up employees for testing Step 5 (EMP-01 → EMP-09), spread over the
// roles in company-config.yaml. Names, IC numbers and bank numbers are invented.
// `npm run db:seed` refuses to run against anything but the dev project.
//
// Work emails are plus-addresses of the first owner email when it is a Gmail address
// (you+rakan-aina@gmail.com lands in your own inbox), so you can invite any of these
// people in Settings > Users and sign in as them. Otherwise they use example.test.

const id = (n) => `5eed0000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const TEST_EMPLOYEE_IDS = Array.from({ length: 8 }, (_, i) =>
  id(101 + i),
);

/** you@gmail.com + "aina" → you+rakan-aina@gmail.com; other domains → aina@example.test. */
export function testEmail(ownerEmail, slug) {
  const [local, domain] = String(ownerEmail ?? "").split("@");
  if (local && /^(gmail|googlemail)\.com$/i.test(domain ?? "")) {
    return `${local.split("+")[0]}+rakan-${slug}@${domain}`.toLowerCase();
  }
  return `${slug}@example.test`;
}

/**
 * Role names match roles_to_hire in company-config.yaml; the seed skips anyone whose
 * role is no longer listed there.
 */
export function testPeople(ownerEmail) {
  const [aina, daniel, kavitha, hafiz, siti, jason, farah, aiman] =
    TEST_EMPLOYEE_IDS;
  const slt = "Speech-Language Therapist";
  const ot = "Occupational Therapist";
  const admin = "Centre Administrator";
  const monthly = (salary) => ({ pay_model: "monthly", basic_salary: salary });

  return [
    {
      id: aina,
      slug: "aina",
      full_name: "Nurul Aina binti Ahmad",
      id_no: "880512-14-5432",
      date_of_birth: "1988-05-12",
      gender: "female",
      marital_status: "married",
      religion: "islam",
      pcb_category: "married_spouse_working",
      children_count_eligible: 2,
      role: slt,
      job_title: "Senior Speech-Language Therapist (Clinical Lead)",
      manager_id: null,
      contract: {
        employment_type: "full_time",
        ...monthly("5200.00"),
        start_date: "2026-12-01",
        probation_end: "2027-02-28",
      },
      bank: {
        bank_code: "MBB",
        account_no: "514011223344",
        holder_name: "NURUL AINA BINTI AHMAD",
      },
      dependents: [
        {
          name: "Hakim bin Yusof",
          relationship: "spouse",
          date_of_birth: "1986-03-09",
        },
        {
          name: "Adam bin Hakim",
          relationship: "child",
          date_of_birth: "2015-04-01",
        },
        {
          name: "Aisyah binti Hakim",
          relationship: "child",
          date_of_birth: "2019-10-20",
        },
      ],
    },
    {
      id: daniel,
      slug: "daniel",
      full_name: "Daniel Lim Wei Jie",
      id_no: "950823-10-5617",
      date_of_birth: "1995-08-23",
      gender: "male",
      marital_status: "single",
      pcb_category: "single",
      role: slt,
      job_title: null,
      manager_id: aina,
      contract: {
        employment_type: "full_time",
        ...monthly("3800.00"),
        start_date: "2026-12-01",
        probation_end: "2027-05-31",
      },
      bank: {
        bank_code: "CIMB",
        account_no: "8001234567",
        holder_name: "DANIEL LIM WEI JIE",
      },
    },
    {
      id: kavitha,
      slug: "kavitha",
      full_name: "Kavitha a/p Raman",
      id_no: "000415-08-5328",
      date_of_birth: "2000-04-15",
      gender: "female",
      marital_status: "single",
      religion: "hinduism",
      pcb_category: "single",
      role: slt,
      job_title: "Speech-Language Therapist (part-time)",
      manager_id: aina,
      contract: {
        employment_type: "part_time",
        pay_model: "hourly",
        hourly_rate: "45.00",
        normal_hours_per_day: "4",
        work_days_per_week: "3",
        start_date: "2027-01-04",
      },
      bank: {
        bank_code: "PBB",
        account_no: "3198765432",
        holder_name: "KAVITHA A/P RAMAN",
      },
    },
    {
      id: hafiz,
      slug: "hafiz",
      full_name: "Muhammad Hafiz bin Rahman",
      id_no: "910307-14-5891",
      date_of_birth: "1991-03-07",
      gender: "male",
      marital_status: "married",
      religion: "islam",
      pcb_category: "married_spouse_not_working",
      children_count_eligible: 1,
      role: ot,
      job_title: "Senior Occupational Therapist",
      manager_id: aina,
      contract: {
        employment_type: "full_time",
        ...monthly("5000.00"),
        start_date: "2026-12-01",
        probation_end: "2027-02-28",
      },
      bank: {
        bank_code: "BIMB",
        account_no: "14023010087654",
        holder_name: "MUHAMMAD HAFIZ BIN RAHMAN",
      },
      dependents: [
        {
          name: "Nur Izzah binti Salleh",
          relationship: "spouse",
          date_of_birth: "1993-07-14",
        },
        {
          name: "Irfan bin Muhammad Hafiz",
          relationship: "child",
          date_of_birth: "2022-01-30",
        },
      ],
    },
    {
      id: siti,
      slug: "siti",
      full_name: "Siti Khadijah binti Omar",
      id_no: "020918-01-6044",
      date_of_birth: "2002-09-18",
      gender: "female",
      marital_status: "single",
      religion: "islam",
      pcb_category: "single",
      role: ot,
      job_title: null,
      manager_id: hafiz,
      contract: {
        employment_type: "full_time",
        ...monthly("3600.00"),
        start_date: "2027-01-04",
        probation_end: "2027-06-30",
      },
      bank: {
        bank_code: "RHB",
        account_no: "26201300045678",
        holder_name: "SITI KHADIJAH BINTI OMAR",
      },
    },
    {
      id: jason,
      slug: "jason",
      full_name: "Jason Tan Kok Wai",
      id_no: "971130-07-5233",
      date_of_birth: "1997-11-30",
      gender: "male",
      marital_status: "single",
      pcb_category: "single",
      role: ot,
      job_title: "Occupational Therapist (sessional)",
      manager_id: hafiz,
      contract: {
        employment_type: "contract",
        pay_model: "per_session",
        session_rate: "80.00",
        start_date: "2026-12-01",
        end_date: "2027-11-30",
      },
      bank: {
        bank_code: "HLB",
        account_no: "23850012345",
        holder_name: "TAN KOK WAI",
      },
    },
    {
      id: farah,
      slug: "farah",
      full_name: "Farah Hanis binti Zulkifli",
      id_no: "930621-10-5786",
      date_of_birth: "1993-06-21",
      gender: "female",
      marital_status: "married",
      religion: "islam",
      pcb_category: "married_spouse_working",
      role: admin,
      job_title: null,
      manager_id: null,
      contract: {
        employment_type: "full_time",
        ...monthly("2800.00"),
        start_date: "2026-11-16",
        probation_end: "2027-02-15",
      },
      bank: {
        bank_code: "MBB",
        account_no: "162087654321",
        holder_name: "FARAH HANIS BINTI ZULKIFLI",
      },
    },
    {
      id: aiman,
      slug: "aiman",
      full_name: "Aiman Haziq bin Kamal",
      id_no: "030102-14-6119",
      date_of_birth: "2003-01-02",
      gender: "male",
      marital_status: "single",
      religion: "islam",
      pcb_category: "single",
      role: admin,
      job_title: "Front Desk Executive",
      manager_id: farah,
      contract: {
        employment_type: "part_time",
        pay_model: "hourly",
        hourly_rate: "12.00",
        normal_hours_per_day: "5",
        work_days_per_week: "5",
        start_date: "2027-01-04",
      },
      bank: {
        bank_code: "BSN",
        account_no: "0410029876543210",
        holder_name: "AIMAN HAZIQ BIN KAMAL",
      },
    },
  ].map((person) => ({
    ...person,
    work_email: testEmail(ownerEmail, person.slug),
    phone: null,
  }));
}
