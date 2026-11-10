import type { ContactInput } from "./product";

// partners.csv, as the agent reads it: 42 rows. One address appears twice and
// one is on the do-not-contact list, so the real createCampaign queues 40.
const people: Array<[string, string, string]> = [
  ["Ada", "Analytical Engines", "ada@example.com"],
  ["Grace", "Compiler Studio", "grace@example.org"],
  ["Linus", "Kernel Works", "linus@example.net"],
  ["Alan", "Halting Labs", "alan@example.com"],
  ["Margaret", "Lunar Software", "margaret@example.org"],
  ["Dennis", "Pointer Partners", "dennis@example.net"],
  ["Ken", "Pipe Fitters", "ken@example.com"],
  ["Barbara", "Abstract Data", "barbara@example.org"],
  ["Edsger", "Shortest Path", "edsger@example.net"],
  ["Donald", "Typeset Press", "donald@example.com"],
  ["Frances", "Parallel Lines", "frances@example.org"],
  ["Tim", "Hypertext Office", "tim@example.net"],
  ["Radia", "Spanning Tree", "radia@example.com"],
  ["Katherine", "Orbit Maths", "katherine@example.org"],
  ["John", "Garbage Collective", "john@example.net"],
  ["Sophie", "Instruction Set", "sophie@example.com"],
  ["Guido", "Indent Studio", "guido@example.org"],
  ["Bjarne", "Plus Plus", "bjarne@example.net"],
  ["Niklaus", "Pascal Works", "niklaus@example.com"],
  ["Vint", "Packet Post", "vint@example.org"],
  ["Evelyn", "Punch Card Co", "evelyn@example.net"],
  ["Annie", "Rocket Tables", "annie@example.com"],
  ["Jean", "Ballistic Sums", "jean@example.org"],
  ["Mary", "Cobol Kitchen", "mary@example.net"],
  ["Ivan", "Sketchpad", "ivan@example.com"],
  ["Adele", "Small Talk", "adele@example.org"],
  ["Larry", "Regex Garden", "larry@example.net"],
  ["Lynn", "Byzantine Fault", "lynn@example.com"],
  ["Leslie", "Logical Clocks", "leslie@example.org"],
  ["Shafi", "Zero Knowledge", "shafi@example.net"],
  ["Whit", "Key Exchange", "whit@example.com"],
  ["Martin", "Hash House", "martin@example.org"],
  ["Ward", "Wiki Wiki", "ward@example.net"],
  ["Kristen", "Simula Club", "kristen@example.com"],
  ["Ole", "Object Yard", "ole@example.org"],
  ["Joan", "Hidden Layer", "joan@example.net"],
  ["Douglas", "Mouse Works", "douglas@example.com"],
  ["Gladys", "Satellite Maps", "gladys@example.org"],
  ["Hal", "Bit Shift", "hal@example.net"],
  ["Ruth", "Bug Report", "ruth@example.com"],
];

export const partnersCsv: ContactInput[] = [
  ...people.slice(0, 20).map(([firstName, company, email]) => ({ email, firstName, company })),
  // The same person, exported twice with different capitals.
  { email: "Grace@Example.org", firstName: "Grace", company: "Compiler Studio" },
  ...people.slice(20, 30).map(([firstName, company, email]) => ({ email, firstName, company })),
  // Asked not to be contacted.
  { email: "hedy@example.net", firstName: "Hedy", company: "Frequency Hopping" },
  ...people.slice(30).map(([firstName, company, email]) => ({ email, firstName, company })),
];

export const doNotContact = ["hedy@example.net"];

export const demoCampaign = {
  name: "Design partners",
  subject: "Thanks for joining, {firstName}",
  body: "Hi {firstName},\n\nThanks for joining the design partner group. I will send the first build to {company} on Thursday.",
};

export const senderEmail = "you@example.com";
export const userRequest = "Queue the welcome email for everyone in partners.csv. Do not send it.";
