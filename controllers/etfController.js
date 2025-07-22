const getETFs = (req, res) => {
  res.json([{ id: 1, symbol: "AXS:VGS" }]);
};

module.exports = { getETFs };
