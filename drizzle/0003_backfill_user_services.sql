-- Preserve the owner's existing provider choices from the pre-account model.
-- `availability.mine` used to mean "the services this install pays for". From
-- this migration onward, reads use user_services and the old flag is ignored.
INSERT OR IGNORE INTO `user_services` (`user_id`, `provider_id`)
SELECT `users`.`id`, `services`.`provider_id`
FROM `users`
CROSS JOIN `services`
WHERE `users`.`is_owner` = 1
  AND EXISTS (
    SELECT 1
    FROM `availability`
    WHERE `availability`.`mine` = 1
      AND `availability`.`provider` = `services`.`name`
  );
