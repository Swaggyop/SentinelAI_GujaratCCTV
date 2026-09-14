const validateUUID = (id) => {
  const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return regex.test(id);
};

const validateCameraId = (id) => {
  const regex = /^CAM-[A-Z0-9]{3}-\d{3}$/i;
  return regex.test(id);
};

const validatePlate = (plate) => {
  const regex = /^[A-Z0-9]{4,12}$/i;
  return regex.test(plate);
};

module.exports = {
  validateUUID,
  validateCameraId,
  validatePlate
};
