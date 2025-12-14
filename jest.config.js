export default {
  reporters: [
    "default",
    ["jest-junit", { outputName: "test-results.xml" }]
  ],
};
  