// frontend/src/utils/majors.js
// Dapat tugma sa MAJORS_BY_DEPARTMENT sa backend/accounts/models.py

export const MAJORS_BY_DEPARTMENT = {
  CTE: [
    'Mathematics',
    'English',
    'Filipino',
    'Science',
    'Social Studies',
    'Physical Education',
  ],
  CIT: [
    'Automotive Technology',
    'Computer Programming',
    'Construction/Civil Technology',
    'Electrical Technology',
    'Electronics Technology',
    'Food Services Management',
    'Mechanical Technology',
    'Industrial Arts',
  ],
};

export const majorsFor = (department) => MAJORS_BY_DEPARTMENT[department] || [];

export const departmentOfMajor = (major) =>
  Object.keys(MAJORS_BY_DEPARTMENT).find((d) => MAJORS_BY_DEPARTMENT[d].includes(major)) || null;
