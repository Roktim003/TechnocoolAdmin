/**
 * Passwords that appear at the top of public breach lists (SecLists / HIBP top lists), limited
 * to the ones long enough to pass the 10-character minimum, plus local guesses. Compared
 * case-insensitively. Short or simple patterns are caught by isWeakPattern below.
 */
const COMMON = `
1234567890 0123456789 0987654321 9876543210 1122334455 1111111111 0000000000 2222222222 1234512345 1234554321
12345678910 123456789a 123456789q 1234567890a 1234567890q a123456789 q123456789 123456789abc 1q2w3e4r5t 1q2w3e4r5t6y
q1w2e3r4t5 q1w2e3r4t5y6 1qaz2wsx3edc qazwsxedcrfv zaq12wsxcde 1qazxsw23edc qwertyuiop qwertyuiop123 asdfghjkl1 asdfghjkl123
zxcvbnm123 qwerty1234 qwerty12345 qwerty123456 qwertyuiop1 qwerty123! qwertyqwerty asdfasdfasdf abcdefghij abcdefghijk
abcd123456 abc1234567 abcde12345 abcdef1234 abc123abc123 password12 password123 password1234 password12345 password123!
password@123 password#123 password1! passw0rd123 p@ssw0rd123 p@ssword123 p@$$w0rd123 passwordpassword mypassword mypassword1
mypassword123 newpassword newpassword1 newpassword123 changeme123 changeme1234 welcome123 welcome1234 welcome@123 welcome123!
iloveyou12 iloveyou123 iloveyou1234 letmein123 letmein1234 sunshine123 football123 baseball123 basketball basketball1
superman123 batman1234 princess123 dragon1234 monkey12345 starwars123 trustno1234 shadow1234 master1234 michael123
jennifer123 jessica123 charlie123 computer123 internet123 whatever123 administrator admin12345 admin123456 admin@1234
admin@12345 administrator1 adminadmin adminadmin1 root123456 rootroot123 test123456 testtest123 testing123 user123456
guest12345 default123 secret1234 secret12345 bangladesh bangladesh1 bangladesh123 bangladesh@123 dhaka12345 dhaka123456
bismillah1 bismillah123 alhamdulillah allahuakbar 1234qwerasdf qwer1234asdf asdf1234qwer 11223344556677 123123123123
147258369a 1472583690 159753456852 789456123a 7894561230 iloveyou! football1! liverpool123 manchester123 chelsea123
stockbook stockbook1 stockbook123 stockbook@123 technocool technocool1 technocool123 inventory1 inventory123 warehouse1
warehouse123 company123 office12345 hvac123456
`;

export const COMMON_PASSWORDS: ReadonlySet<string> = new Set(COMMON.split(/\s+/).filter(Boolean).map((p) => p.toLowerCase()));

/** Same character repeated, or a straight run like abcdefghij / 0123456789 / 9876543210. */
function isWeakPattern(p: string): boolean {
  if (/^(.)\1+$/.test(p)) return true;
  const codes = [...p].map((c) => c.charCodeAt(0));
  const step = codes[1]! - codes[0]!;
  return Math.abs(step) === 1 && codes.every((c, i) => i === 0 || c - codes[i - 1]! === step);
}

export function isCommonPassword(password: string): boolean {
  const p = password.trim().toLowerCase();
  return COMMON_PASSWORDS.has(p) || isWeakPattern(p);
}
